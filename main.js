/*
 * Project for WhatsApp Chatbot
 * This project utilizes the WhatsApp Business API to build a chatbot interface.
 */

"use strict";


// Import necessary dependencies
import request from "request"; // For making HTTP requests
import OpenAI from "openai"; // For interacting with the OpenAI API
import express from "express"; // Web framework for handling HTTP requests
import body_parser from "body-parser"; // Middleware to parse incoming request bodies
import axios from "axios"; // HTTP client for making requests
import fs from "node-fs"; // File system operations
import { PostHog } from 'posthog-node'; // For capturing analytics events
import bcrypt from 'bcrypt'; // For hashing sensitive data
import similarity from './similarity.js'; // Custom function for comparing strings
import { log } from './logging.js'; // Logging utility functions
import { checkDatabase, updateDatabase, checkCache, updateCache, resetUsers, resetCache} from './database.js'; // Functions for database operations

// Assign global variables
const app = express().use(body_parser.json()); // Creates express http server
const openai = new OpenAI({apiKey: process.env['OPENAI_API_KEY']}); // Initialize OpenAI with API key
const token = process.env.WHATSAPP_TOKEN; // WhatsApp API access token
const assistant_id = process.env.ASSISTANT_ID; // OpenAI Assistant ID
const connectionString = process.env.DATABASE_URL; // Database connection string
const saltRounds = 10; // Number of salt rounds for bcrypt hashing


/**
 * Function to send a message to a user via WhatsApp.
 * @param {string} user_number_id - The ID of the user.
 * @param {string} phone_number_id - The ID of the phone number.
 * @param {string} user_question - The user's question.
 * @param {string} from - The sender's phone number.
 * @param {string} message - The message to send.
 * @returns {void}
 */
async function sendMessage(user_number_id, phone_number_id, user_question, from, message) {
  // Send message using Axios to WhatsApp API
  axios({ 
    method: "POST", 
    url: "https://graph.facebook.com/v12.0/" + phone_number_id + "/messages?access_token=" + token,
    data: { messaging_product: "whatsapp", to: from, text: { body: message },},
    headers: { "Content-Type": "application/json" },
  }).catch(function (error) {
    // Log error if message sending fails
    if (error.response) {
		  console.log("ERROR: Error occured while sending users message. Check WhatsApp number and API access token!");
		  process.exit();
	  }
  });
  
  // Initialize PostHog client for analytics tracking
  const clientPH = new PostHog(
        process.env.POSTHOG_TOKEN,
      { host: 'https://eu.posthog.com' }
  )
  
  // Hash user ID using bcrypt
  const hashed_id = bcrypt.hashSync(user_number_id, saltRounds);
  
  // Capture event indicating message sent to user
  clientPH.capture({
    distinctId: hashed_id,
    event: 'Message sent to user',
    properties: {
        from: from,
        message: message,
    },
  })
  
  // Shutdown PostHog client
  clientPH.shutdown();
}


/**
 * Function to interact with the chatbot.
 * @param {string} user_number_id - The ID of the user.
 * @param {string} phone_number_id - The ID of the phone number.
 * @param {string} user_question - The user's question.
 * @param {string} from - The sender's phone number.
 * @param {boolean} queryExists - Indicates whether the user's query exists in the cache.
 * @returns {void}
 */
async function chatbot(user_number_id, phone_number_id, user_question, from, queryExists) {
    try {
        // Retrieve OpenAI assistant
        const assistant = await openai.beta.assistants.retrieve(assistant_id);
        
        // Check if user ID exists in database
        const result = await checkDatabase(user_number_id);
        user_number_id = bcrypt.hashSync(user_number_id, saltRounds);
        var found = result.found;
        var thread_id = result.thread_id;
        
        // Create or retrieve thread based on user existence
        if (found) {
            // Retrieve existing thread (TEMPORARILY DISABLED!)
            // var thread = await openai.beta.threads.retrieve(thread_id);
          
            /**
            Thread ID's are temporarily disabled due to an issue with cached responses. While the chatbot effectively caches responses 
            for isolated queries, it encounters inaccuracies when users ask follow-up questions referencing previous AI responses. 
            This discrepancy arises because the cached responses do not consider the context of previous interactions, leading to incorrect 
            or irrelevant responses. To keep the chatbot function correctly a new thread is created each time for now.
            */

            // TEMPORARY CODE CREATING A NEW THREAD EACH TIME!
            var thread = await openai.beta.threads.create();
          
        } else {
            // Read in and send GDPR message to user
            fs.readFile('./GDPR.txt', 'utf8', (err, data) => {
              if (err) {
                console.error(err);
                return;
              }
              
              // Send GDPR message to user
              sendMessage(user_number_id, phone_number_id, user_question, from, data);
              
              // Read in and send usage instructions to user
              fs.readFile('./how-to-use.txt', 'utf8', (err, data) => {
                if (err) {
                  console.error(err);
                  return;
                }

                 // Send usage instructions to user
                sendMessage(user_number_id, phone_number_id, user_question, from, data);
              });
            });
          
            // Create new thread
            var thread = await openai.beta.threads.create();
          
            // Update User Database
            await updateDatabase(user_number_id,thread.id);
        }
        
        if (!queryExists) {
          // Pass user question to existing thread
          await openai.beta.threads.messages.create(thread.id, {
              role: "user",
              content: user_question,
          });

          // Use runs to wait for the assistant response and then retrieve it
          const run = await openai.beta.threads.runs.create(thread.id, {
              assistant_id: assistant.id,
          });

          let runStatus = await openai.beta.threads.runs.retrieve(
              thread.id,
              run.id
          );

          // Polling mechanism to see if runStatus is completed
          while (runStatus.status !== "completed") {
              await new Promise((resolve) => setTimeout(resolve, 4000));
              runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
          }

          // Get the last assistant message from the messages array
          const messages = await openai.beta.threads.messages.list(thread.id);

          // Extract AI response from JSON
          let chatbot_response = messages.data[0].content[0].text.value;

          // Send response to user
          sendMessage(user_number_id, phone_number_id, user_question, from, chatbot_response);

          // Update cache with user question and chatbot response
          await updateCache(user_question, chatbot_response);
        }
		
    // Log interaction details
		const logbook = {
		  query_exists: queryExists,
		  query_message: user_question,
		  user_exists: found,
		  user_id: user_number_id,
		  thread_id: thread.id,
		}
		
		log(logbook);
      
    } catch (error) {
        // Log any errors that occur during the interaction
        console.error(error);
    }
}

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));

// Accepts POST requests at /webhook endpoint
app.post("/webhook", (req, res) => {
  // Parse the request body from the POST
  let body = req.body;

  // Check the Incoming webhook message
  // info on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  if (req.body.object) {
      if (
      req.body.entry &&
      req.body.entry[0].changes &&
      req.body.entry[0].changes[0] &&
      req.body.entry[0].changes[0].value.messages &&
      req.body.entry[0].changes[0].value.messages[0]
      ) {
        async function main() {
          let phone_number_id = req.body.entry[0].changes[0].value.metadata.phone_number_id;
          let user_number_id = req.body.entry[0].changes[0].value.contacts[0].wa_id;
          let from = req.body.entry[0].changes[0].value.messages[0].from; // extract the phone number from the webhook payload
          let user_question = req.body.entry[0].changes[0].value.messages[0].text.body; // extract the message text from the webhook payload

          // Send message to user
          const message = "Answering: " + user_question;
          sendMessage(user_number_id, phone_number_id, user_question, from, message);  

          // Check if user question exists in cache
          const result = await checkCache(user_question);
          let found = result.found;
          let response = result.response;
          
          // Call chatbot function to handle user interaction
          await chatbot(user_number_id, phone_number_id, user_question, from, found);
          
          if (found) {
            // Send cached response to user
            sendMessage(user_number_id, phone_number_id, user_question, from, response);  
          }
        }
        main();
    }
  res.sendStatus(200);
  } else {
    // Return a '404 Not Found' if event is not from a WhatsApp API
    res.sendStatus(404);
  }
});

// Accepts GET requests at the /webhook endpoint. You need this URL to set up webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests 
app.get("/webhook", (req, res) => {
    const verify_token = process.env.VERIFY_TOKEN;

    // Parse params from the webhook verification request
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    // Check if a token and mode were sent
    if (mode && token) {
        // Check the mode and token sent are correct
        if (mode === "subscribe" && token === verify_token) {
            // Respond with 200 OK and challenge token from the request
            console.log("WEBHOOK_VERIFIED");
            res.status(200).send(challenge);
        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});

// Optional Database Management Functions
// WARNING WILL DELETE ALL DATA IN A DATABASE
//resetUsers()
//resetCache()
