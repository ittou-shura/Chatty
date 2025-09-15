import User from "../models/user.models.js";

export const getPublicKey = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ publicKey: user.publicKey });
  } catch (error) {
    res.status(500).json({ message: "Could not get public key for the selected user." });
  }
};