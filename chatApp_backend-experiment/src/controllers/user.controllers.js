import User from "../models/user.models.js";

export const getPublicKey = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ publicKey: user.publicKey });
  } catch (error) {
    console.log("Error in getPublicKey controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};