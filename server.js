const express = require('express')
const app = express()
const bodyParser = require('body-parser')
require('dotenv').config()
const cors = require('cors')
const mongoose = require('mongoose')
mongoose.plugin(schema => { schema.options.usePushEach = true })
mongoose.connect(process.env.MONGO_URI)
const db = mongoose.connection
db.on('error', console.error.bind(console, 'connection error:'))
app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html')
})

const Schema = mongoose.Schema

const userSchema = new Schema({
  userName: {type: String, unique: true, required: true},
  userID: {type: String, unique: true, required: true},
  workouts: [{type: mongoose.Schema.Types.ObjectId, ref: 'Workout'}]
})

const workoutSchema = new Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'ExUser'},
  description: {type: String, required: true},
  duration: {type: Number, required: true},
  date: {type: Date, required: true}
})
let ExUser = mongoose.model('ExUser', userSchema)
let Workout = mongoose.model('Workout', workoutSchema)

app.post('/api/exercise/new-user', (req, res) => {
  ExUser.findOne({userName: req.body.username}, (err, doc) => {
    if (err) return console.error(err)
    if (doc) {
      return res.send('Username already taken, please choose another.')
    }
    let newID
    function checkGen () {
      var checkLoop = (isDup) => {
        if (isDup) {
          newID = genID()
          return checkID(newID).then((isDup) => checkLoop(isDup))
        } else {
          Promise.resolve(isDup)
        }
      }
      return checkLoop(true)
    }
    checkGen(newID).then(() => {
      let newUser = ExUser({userName: req.body.username, userID: newID})
      newUser.save((err) => {
        if (err) return console.error(err)
        return res.json({username: req.body.username, userId: newID})
      })
    }).catch((err) => console.error(err))
  })
})

app.post('/api/exercise/add', (req, res) => {
  if (!req.body.userId) return res.json({error: 'please enter a userId'})
  ExUser.findOne({userID: req.body.userId}, (err, doc) => {
    if (err) return console.error(err)
    if (doc) {
      if (!req.body.description) return res.json({error: 'please enter description'})
      else if (!req.body.duration) return res.json({error: 'please enter the duration'})
      else {
        let date = req.body.date ? new Date(req.body.date) : new Date(Date.now())
        if (!(date instanceof Date) || isNaN(date)) return res.json({error: 'Invalid Date format'})
        let wObj = {user: doc._id,
          description: req.body.description,
          duration: req.body.duration,
          date: date}
        let workOut = Workout(wObj)
        workOut.save((err) => {
          if (err) return console.error(err)
          doc.workouts.push(workOut)
          doc.save((err) => {
            if (err) return console.error(err)
          })
          wObj['user'] = doc.userID
          return res.json(wObj)
        })
      }
    } else {
      return res.json({error: 'userID not found'})
    }
  })
})

app.get('/api/exercise/log', (req, res) => {
  if (!req.query.userId) return res.json({error: 'no userID given'})
  let dateRange = {}
  if (req.query.from) Object.assign(dateRange, {$gte: new Date(req.query.from)})
  if (req.query.to) Object.assign(dateRange, {$lte: new Date(req.query.to)})
  let params = {path: 'workouts'}
  if (req.query.from || req.query.to) {
    Object.assign(params, {match: {date: dateRange}})
  }
  if (req.query.limit) {
    Object.assign(params, {options: {limit: req.query.limit}})
  }
  ExUser
    .findOne({userID: req.query.userId})
    .populate(params)
    .exec((err, user) => {
      if (err) return console.error(err)
      if (!user) return res.json({error: 'user not found'})
      let workouts = []
      user.workouts.forEach((obj) => {
        let d = new Date(obj.date)
        d = d.toLocaleDateString('en-US', {timeZone: 'UTC'}).replace(/\//g, '-')
        let wo = {description: obj.description, duration: obj.duration, date: d}
        workouts.push(wo)
      })
      return res.json({userId: req.query.userId,
        username: user.userName,
        count: workouts.length,
        excercise_log: workouts})
    })
})

function genID () {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const LEN = 5
  let Id = ''
  for (let i = 0; i < LEN; i++) {
    Id += CHARS[Math.floor(Math.random() * (CHARS.length))]
  }
  return Id
}

function checkID (id) {
  return new Promise((resolve, reject) => {
    ExUser.findOne({userID: id}, (err, doc) => {
      if (err) return console.error(err)
      return resolve(!!doc)
    })
  })
}

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
