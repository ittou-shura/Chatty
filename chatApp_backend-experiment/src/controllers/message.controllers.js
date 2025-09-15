
import User from "../models/user.models.js";
import Message from "../models/message.models.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import redisClient from "../lib/redis.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const cacheKey = `sidebar_users:${loggedInUserId}`;

    const cachedUsers = await redisClient.get(cacheKey);

    if (cachedUsers) {
      return res.status(200).json(JSON.parse(cachedUsers));
    }

    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    await redisClient.set(cacheKey, JSON.stringify(filteredUsers), {
      EX: 3600, // Cache for 1 hour
    });

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;
    const cacheKey = `messages:${myId}:${userToChatId}`;

    const cachedMessages = await redisClient.get(cacheKey);

    if (cachedMessages) {
      return res.status(200).json(JSON.parse(cachedMessages));
    }

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    await redisClient.set(cacheKey, JSON.stringify(messages), {
      EX: 3600, // Cache for 1 hour
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    // Invalidate cache for this conversation
    const cacheKey1 = `messages:${senderId}:${receiverId}`;
    const cacheKey2 = `messages:${receiverId}:${senderId}`;
    await redisClient.del(cacheKey1);
    await redisClient.del(cacheKey2);

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
