Assignment 3 - Persistence: Two-tier Web Application with Database, Express server, and CSS template

## A3 To Do List

https://a3-charles-russell.onrender.com/

The goal of my project was to build a readily accesible to do list with github OAuth capabilities. One of the challenges that I faced while working on the assignment was understanding how the web pieces flow together conceptually. By far the hardest part of building the application was implementing the github OAuth and updating the code to enable it. I chose to use the GH OAuth because I wanted the extra ten points and I thought it would be a good thing to understand for the future.

I used Pico.css because I didn't want to have to change much of my css. I overrode certain elements to make the site look the way I had it before since I liked how compact it was. 

## Technical Achievements
- **GitHub OAuth**: I implemented github OAuth into my site using passport.js. The site requests authorization from your github to create an account and ties your account to a set of to do tasks. It works by retrieving information from the .env file and searches MongoDB for a user with your github id. If one isn't found the site creates a new user from the details in your github account.
- **Express Middleware**: I used express.session() to keep users logged in throughout a session.
