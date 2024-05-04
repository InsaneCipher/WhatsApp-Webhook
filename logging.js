// Import necessary dependencies
import { user } from './src/schema.js'; // Import schema definitions for user and logs
import { PostHog } from 'posthog-node'; // Import PostHog client library

// Database connection string from environment variable
const connectionString = process.env.DATABASE_URL;


/**
 * Logs events to PostHog analytics platform.
 * @param {object} logbook - Object containing information about the event to be logged.
 */
async function posthog(logbook){
  // Initialize PostHog client
  const clientPH = new PostHog(
      process.env.POSTHOG_TOKEN,
      { host: 'https://eu.posthog.com' }
  )
  
  // Get current timestamp in UTC
  var timestamp =  new Date().toUTCString();
  
  // Determine user status (new or existing)
  var user = "New User";
  if (logbook.user_exists) {
    var user = "Existing User";
  }
  
  // Determine query status (cached or new)
  var query = "Cached Query";
  if (!logbook.query_exists) {
    var query = "New Query";
  }
  
  // Extract user ID and thread ID
  var user_id = logbook.user_id;
  var thread_id = logbook.thread_id;
  
  // Capture event in PostHog
  clientPH.capture({
    distinctId: user_id,
    event: "Chatbot response sent to user", // Event name
    properties: {
        webhook_timestamp: timestamp, // Timestamp of the event
        thread_id: thread_id, // Thread ID associated with the event
        query: query, // Query status (cached or new)
        query_message: logbook.query_message, // Query message
    },
  })
  
  // Shutdown PostHog client
  clientPH.shutdown();
}


/**
 * Logs events to console and PostHog.
 * @param {object} logbook - Object containing information about the event to be logged.
 */
function log(logbook) {
  // Call function to log event to PostHog
  posthog(logbook);
  
  // Form log message
  var log_message = "Date & Time: ";
  var datetime = new Date().toUTCString();
  log_message += datetime;
  if (logbook.user_exists == true) {
    log_message += " - Existing User (ID: " + logbook.user_id + ", Thread ID: " + logbook.thread_id + ")";
  }
  else {
    log_message += " - New User (ID: " + logbook.user_id + ", Thread ID: " + logbook.thread_id + ")";
  }

  if (logbook.query_exists == true) {
    log_message += " - Asked Cached Query: " + logbook.query_message;
  }
  else {
    log_message += " - Asked New Query: " + logbook.query_message;
  }
  
  // Log message to console
  console.log(log_message);
}

// Export the log function
export { log };
