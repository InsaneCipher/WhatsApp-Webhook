// Import necessary dependencies
import bcrypt from "bcrypt"; // Import bcrypt for hashing functionality.
import { drizzle } from 'drizzle-orm/postgres-js'; // Import Drizzle ORM for PostgreSQL database interaction.
import postgres from 'postgres'; //Import PostgreSQL client library.
import { Redis } from "ioredis"; // Import Redis client library for cache interaction.
import { user } from './src/schema.js'; // Import user and logs schemas from the specified file.
import similarity from './similarity.js'; // Import similarity function for comparing strings.
const connectionString = process.env.DATABASE_URL; // The connection string for the PostgreSQL database.


/**
 * Checks the database for a target value.
 * @param {string} target - The value to search for in the database.
 * @returns {Promise<{found: boolean, thread_id: string|undefined}>} - A promise resolving to an object containing whether the target was found and the associated thread_id, if any.
 */
async function checkDatabase(target){
  // Connect to the PostgreSQL database using the connection string.
  const client = postgres(connectionString);
  // Initialize the Drizzle ORM with the connected client.
  const db = drizzle(client);
  // Initialize variables for storing thread_id and found status.
  var thread_id = undefined;
  var found = false;
  
  // Retrieve all user records from the user database.
  var users = await db.select({ID: user.id, thread_id: user.thread_id}).from(user);
  // Iterate through each user record.
  for(var i = 0, len = users.length; i < len; i++) {
    // Retrieve the hashed value from the current user record.
    const hash = users[i].ID;
    // Compare the hashed value with the target value using bcrypt.
    found = bcrypt.compareSync(target, hash); // true
    // If the target is found, exit the loop.
    if (found == true){
      break;
    }
  }
  // Return an object containing the found status and associated thread_id.
  return {found, thread_id};
}


/**
 * Updates the database with the given user ID and thread ID.
 * @param {string} user_id - The ID of the user to insert into the database.
 * @param {string} user_thread_id - The thread ID associated with the user.
 * @returns {Promise<void>} - A promise that resolves when the database update is complete.
 */
async function updateDatabase(user_id, user_thread_id){
  // Establish a connection to the PostgreSQL database.
  const client = postgres(connectionString);
  // Initialize the Drizzle ORM with the connected client.
  const db = drizzle(client);
  
  // Insert the user ID and thread ID into the database.
  await db.insert(user).values({ id: user_id, thread_id: user_thread_id });
  
  // Close the database connection.
  await client.end();
}


/**
 * Checks the cache for a given query and returns the response if found.
 * @param {string} query - The query to search for in the cache.
 * @returns {Promise<{found: boolean, response: string}>} - A promise that resolves to an object containing whether the query was found in the cache and the associated response, if found.
 */
async function checkCache(query){
  let found = false;
  let response = "error";
  // Establish a connection to the Redis cache server.
  const client = new Redis(process.env.REDIS_URL);
  
  // Retrieve all keys from the cache.
  let keys = await client.keys('*');

  // Iterate through each key in the cache.
  for(var i = 0, len = keys.length; i < len; i++) {
      var key = keys[i];

      // Check if there is a similarity between the query and the key.
      const check = await similarity(query, key);

      if (check == "yes") {
        found = true;
        // Retrieve the response associated with the key from the cache.
        response = await client.get(key);
        break;
      }
  }
 
  // Disconnect from the Redis cache server.
  client.disconnect();
  
  // Return an object containing whether the query was found in the cache and the associated response.
  return {found, response};
}


/**
 * Updates the cache with the given query and response.
 * @param {string} query - The query to set in the cache.
 * @param {string} response - The response associated with the query.
 * @returns {Promise<void>} - A promise that resolves when the cache update is complete.
 */
async function updateCache(query, response){
  try {
      // Establish a connection to the Redis cache server.
      const client = new Redis(process.env.REDIS_URL);
      // Set the query and response in the cache.
      await client.set(query, response);
      // Disconnect from the Redis cache server.
      await client.disconnect();
  }
  catch {console.log("MINOR ERROR UPDATING CACHE!")}
}


/**
 * Resets the user data in the database.
 * @returns {Promise<void>} - A promise that resolves when the user data is reset.
 */
async function resetUsers(){
  console.log("WARNING MANUAL USER RESET IS ENABLED!!!!");
  // Establish a connection to the PostgreSQL database.
  const client = postgres(connectionString);
  // Initialize the Drizzle ORM with the connected client.
  const db = drizzle(client);
  // Delete all user data from the database.
  await db.delete(user);
}


/**
 * Resets the cache by deleting all keys.
 * @returns {Promise<void>} - A promise that resolves when the cache is reset.
 */
async function resetCache(){
  console.log("WARNING MANUAL CACHE RESET IS ENABLED!!!");
  // Establish a connection to the Redis cache server.
  const client = new Redis(process.env.REDIS_URL);
  // Retrieve all keys from the cache and delete each key.
  await client.keys('*', async function (err, keys) {
    if (err) return console.log(err);
    for(var i = 0, len = keys.length; i < len; i++) {
      // Delete the key from the cache.
      await client.del(keys[i]);
    }
  });
  
  await client.disconnect();
}

// Export the functions for external use.
export { checkDatabase, updateDatabase, checkCache, updateCache, resetUsers, resetCache};
