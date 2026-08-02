//const express = require("express")
import express from "express";
import "dotenv/config"

const app = express();
const PORT = process.env.PORT

console.log(process.env.DB_URL);


app.listen(PORT, () => console.log("Server is up and running on port PORT",PORT));
