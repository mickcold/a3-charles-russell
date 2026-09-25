// IMPORTANT: you must run `npm install` in the directory for this assignment
// to install express if you're testing this on your local machine.
// On Render, make sure `npm install` is your build command.

//Require a .env file and suppress the output so the user and pass don't get leaked
require('dotenv').config({quiet: true})

const express = require('express'),
      { MongoClient, ObjectId } = require('mongodb'),
      session = require('express-session'),
      passport = require('passport'),
      GitHubStrategy = require('passport-github2').Strategy,
      app = express(),
      dir = 'public',
      port = 3000

//Creating the MongoClient
const client = new MongoClient(process.env.MONGODB_URI)

let collection = null
let users = null


//Milliseconds per day
const MS_PER_DAY = 24 * 60 * 60 * 1000

const appdata = []

//Calculates the days remaining to complete the task from the creation date and the due date
const deriveDaysRemaining = function(row) {
  const created = new Date(row.created_date),
        due     = new Date(row.due_date)

  row.days_remaining = Math.round((due - created) / MS_PER_DAY)

  return row
}

//Builds the tasks with the user inputted data and the id
const buildRow = function(incoming) {
  //Verifies the datatype is a string if thats true whitespace is cut off, if false task equals an empty string
  const task = typeof incoming.task === 'string' ? incoming.task.trim() : ''

  //Checks if the task is empty and returns null if so
  if (task === '') {
    return null
  }

  //If the creation date is valid get the first 10 characters which form the date without a time, if its invalid it makes the creation date according to the system clock
  const created_date = isValidDate(incoming.created_date)
    ? incoming.created_date.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  //If the due date is valid get the first 10 characters which form the date without a time, if its invalid it makes the due date seven days from the creation date
  const due_date = isValidDate(incoming.due_date)
    ? incoming.due_date.slice(0, 10)
    : addDays(created_date, 7)

  return deriveDaysRemaining({task, created_date, due_date})
}

//A helper function for buildRow for when there's an invalid due date, it adds days to dateString and returns just the month day and year
const addDays = function(dateString, days) {
  const date = new Date(dateString)

  date.setDate(date.getDate() + days)

  return date.toISOString().slice(0, 10)
}

//Returns a boolean after determining if a date is valid or not
const isValidDate = function(value) {
  //Checks that the type of value is a string and that Date.parse(value) succeeded by checking that a timestamp was created and not NaN
  return typeof value === 'string' && Number.isNaN(Date.parse(value)) === false
}

//Middleware that runs for every request:

//Changes the request body, which is in text (main.js:22), into a JSON object
//Skips if the text isn't valid JSON
app.use(express.json())

//The application is set to trust the immediate reverse proxy
app.set('trust proxy', 1)

//Declares the parameters of the session; the secret, don't save unless changes are made, don't create a session or cookie for a user who's not logged in, and automatically match the cookie 
// security of the connection
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {secure: 'auto'}
}))

//Middleware for passport:

//Initializes the use of passport
app.use(passport.initialize())

//Checks for a logged in user and runs deserializeUser if one is
app.use(passport.session())

//Uses passport with the info in .env
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback'
  },
  //Sign in or create new account
  async function(accessToken, refreshToken, profile, done) {
    try {
      //Searches for a github user ID
      let user = await users.findOne({githubId: profile.id})

      //If the user doesn't exist create a new user
      if (user === null) {
        user = {githubId: profile.id, username: profile.username, created: new Date()}

        //Adds the user to MongoDB and sets their user id
        const result = await users.insertOne(user)
        user._id = result.insertedId

        //Marks the account as a new user
        user.newAccount = true
      }

      done(null, user)
    }
    //Error catch
    catch (err) {
      done(err)
    }
  }
))

//Decides what gets saved in the session
passport.serializeUser(function(user, done) {
  done(null, user._id.toString())
})

//Looks up a user
passport.deserializeUser(async function(id, done) {
  try {
    //Finds a specific user
    const user = await users.findOne({_id: new ObjectId(id)})

    done(null, user)
  }
  catch (err) {
    done(err)
  }
})

//Redirects users to github login and the site requests the ability to read the user's GH profile
app.get('/auth/github', passport.authenticate('github', {scope: ['read:user']}))

//Specifies where the results of the login go to. Success -> '/' and failure -> '/login.html'
app.get('/auth/github/callback',
  passport.authenticate('github', {failureRedirect: '/login.html'}),
  function(request, response) {
    //If the user is new show welcome message
    if (request.user.newAccount) {
      return response.redirect('/?new=1')
    }

    response.redirect('/')
  }
)

//Verifies that the user is logged in and says who the user is
app.get('/me', function(request, response) {
  if (!request.isAuthenticated()) {
    return sendJSON(response, 401, {error: 'not logged in'})
  }

  sendJSON(response, 200, request.user)
})

//Verifies that the user is logged in to protect API routes
const requireLogin = function(request, response, next) {
  if (request.isAuthenticated()) {
    return next()
  }

  sendJSON(response, 401, {error: 'not logged in'})
}

//Allows the user to logout
app.post('/logout', function(request, response, next) {
  request.logout(function(err) {
    //Catch logout error
    if (err) {
      return next(err)
    }

    response.redirect('/login.html')
  })
})

//Retrieves the tasks of a specified user and places them in an array
const findTasks = function(request) {
  return collection.find({owner: request.user._id}).toArray()
}

//Collects all data from MongoDB
app.get('/data', requireLogin, async function(request, response) {
  const rows = await findTasks(request)
  sendJSON(response, 200, rows)
  }
)

//Handles adding a new row to the to do list
const handleAdd = async function(request, response) {
  const incoming = request.body

  //Builds the row with the incoming JSON
  const row = buildRow(incoming)

  //Check if the row is empty
  if (row === null) {
    return sendJSON(response, 400, {error: 'a task description is required'})
  }

  //Associates the row with the current user
  row.owner = request.user._id

  //Pushes the new row to Mongo
  await collection.insertOne(row)

  const rows = await findTasks(request)
  //Sends the updated data
  sendJSON(response, 200, rows)
}

//Handles deleting a row from the to do list
const handleDelete = async function(request, response) {
  const incoming = request.body

  //Checks MongoDB for an object with the id given by incoming.id and is owned by the user and deletes it if there's a match
  const result = await collection.deleteOne({_id: new ObjectId(incoming.id), owner: request.user._id})

  //Checking the result of findIndex to see if there wasn't a match
  if (result.deletedCount === 0) {
    return sendJSON(response, 404, {error: 'no task with id: ' + incoming.id})
  }

  const rows = await findTasks(request)
  sendJSON(response, 200, rows)
}

//Handles the modification of a row
const handleModify = async function(request, response) {
  const incoming = request.body

  //Builds the modified row
  const row = buildRow(incoming)

  //Checks row is valid
  if (row === null) {
    return sendJSON(response, 400, {error: 'a task description is required'})
  }

  //Searches MongoDB for a object with the given id and owner, overwrites the row with updated info ($set: row)
  const result = await collection.updateOne({_id: new ObjectId(incoming.id), owner: request.user._id}, {$set: row})

  //Checking the result of findIndex to see if there wasn't a match
  if (result.matchedCount === 0) {
    return sendJSON(response, 404, {error: 'no task with id ' + incoming.id})
  }

  const rows = await findTasks(request)
  sendJSON(response, 200, rows)
}

//Routing for Create, Update, Delete parts of CRUD
app.post('/add', requireLogin, handleAdd)
app.post('/delete', requireLogin, handleDelete)
app.post('/modify', requireLogin, handleModify)

//Pages accessible by users not logged in
const openPaths = ['/login.html', '/css/main.css']

//Checks if the user is logged in or if its a page anyone can access
app.use(function(request, response, next) {
  if (request.isAuthenticated() || openPaths.includes(request.path)) {
    return next()
  }

  response.redirect('/login.html')
})

//Searches the directory, in this case 'public' (server.js:11), for static files requested by the browser without having to make specific routes
//Handles GET and HEAD requests exclusively
app.use(express.static(dir))

//Catch for any unknown routes that aren't handled above
app.use(function(request, response) {
  //If it's a post request that isn't handled throw an error
  if (request.method === 'POST') {
    return sendJSON(response, 404, {error: 'unknown route ' + request.url})
  }

  //Otherwise, the file doesn't exist in the directory
  response.status(404).send('404 Error: File Not Found')
})

//Error catch if the request body wasn't valid JSON
app.use(function(err, request, response, next) {
  if (err.type === 'entity.parse.failed') {
    return sendJSON(response, 400, {error: 'body was not valid JSON'})
  }

  next(err)
})

//Sends payload as a JSON string with a status code to the browser
const sendJSON = function(response, status, payload) {
  //.status(status): sets the status code
  //.json(payload): turns the payload into a JSON string, sets content type, sends it, and completes the response
  response.status(status).json(payload)
}

//Starts the connection to MongoDB
const start = async function() {
  try {
    //Connects to MongoDB
    await client.connect()

    //Makes sure that MongoDB is actually replying to the site
    await client.db('admin').command({ping: 1})

    //Gets a reference to a MongoDB collection, in this case 'tasks'
    collection = client.db('a3').collection('tasks')

    //Gets a reference to a MongoDB collection of users
    users = client.db('a3').collection('users')

    console.log('Connected to MongoDB')
  }
  //Error catch for connecting to MongoDB
  catch (err) {
    console.error('Unable to connect to MongoDB: ' + err.message)
    process.exit(1)
  }

  app.listen(process.env.PORT || port)
  console.log('Listening on port ' + (process.env.PORT || port))
}

start()
