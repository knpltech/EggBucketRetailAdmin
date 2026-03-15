import jwt from "jsonwebtoken";

export const signAuthToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || "change-me-in-production", {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  });

export const verifyAuthToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET || "change-me-in-production");
