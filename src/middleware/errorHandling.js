// middleware/errorHandling.js

const errorHandler = (err, req, res, next) => {
  console.error(err); // Log the error on the server

  // Send a generic response to the client
  res.status(500).json({
    message: "An error occurred on the server, please double-check your request!"
  });
};

export default errorHandler; // This is important!
