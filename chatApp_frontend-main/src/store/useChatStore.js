import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useKeyStore } from "./useKeyStore";
import * as nacl from "tweetnacl";
import { decodeBase64, encodeUTF8, decodeUTF8, encodeBase64 } from "tweetnacl-util";

const getSharedKey = async (otherUserPublicKeyB64) => {
  const secretKeyB64 = localStorage.getItem("secretKey");
  if (!secretKeyB64) {
    throw new Error("Secret key not found in local storage");
  }

  const secretKey = decodeBase64(secretKeyB64);
  const otherUserPublicKey = decodeBase64(otherUserPublicKeyB64);

  return nacl.box.before(otherUserPublicKey, secretKey);
};

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  sharedKeys: {},

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to get users");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const otherUserPublicKeyB64 = await useKeyStore.getState().getPublicKey(userId);
      if (!otherUserPublicKeyB64) throw new Error("Could not get public key for the other user.");

      const sharedKey = await getSharedKey(otherUserPublicKeyB64);

      const res = await axiosInstance.get(`/messages/${userId}`);
      const encryptedMessages = res.data;

      const decryptedMessages = encryptedMessages.map((message) => {
        if (message.text) {
          try {
            const nonce = decodeBase64(message.nonce);
            const encryptedText = decodeBase64(message.text);
            const decryptedTextBytes = nacl.secretbox.open(encryptedText, nonce, sharedKey);
            if (!decryptedTextBytes) throw new Error("Decryption failed");
            const decryptedText = decodeUTF8(decryptedTextBytes);
            return { ...message, text: decryptedText };
          } catch (e) {
            console.error("Failed to decrypt message:", e);
            return { ...message, text: "Unable to decrypt message" };
          }
        }
        return message;
      });

      set({ messages: decryptedMessages });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to get messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      const otherUserPublicKeyB64 = useKeyStore.getState().publicKeys[selectedUser._id];
      if (!otherUserPublicKeyB64) throw new Error("Could not get public key for the other user.");

      const sharedKey = await getSharedKey(otherUserPublicKeyB64);

      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageBytes = encodeUTF8(messageData.text);
      const encryptedMessage = nacl.secretbox(messageBytes, nonce, sharedKey);

      const encryptedMessageB64 = encodeBase64(encryptedMessage);
      const nonceB64 = encodeBase64(nonce);

      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
        ...messageData,
        text: encryptedMessageB64,
        nonce: nonceB64,
      });

      // Decrypt for instant display
      const decryptedMessage = {
        ...res.data,
        text: messageData.text,
      };

      set({ messages: [...messages, decryptedMessage] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("newMessage", async (newMessage) => {
      const { selectedUser, messages } = get();
      if (!selectedUser || newMessage.senderId !== selectedUser._id) return;

      try {
        const otherUserPublicKeyB64 = useKeyStore.getState().publicKeys[selectedUser._id];
        if (!otherUserPublicKeyB64) throw new Error("Could not get public key for decryption.");

        const sharedKey = await getSharedKey(otherUserPublicKeyB64);

        const nonce = decodeBase64(newMessage.nonce);
        const encryptedText = decodeBase64(newMessage.text);

        const decryptedTextBytes = nacl.secretbox.open(encryptedText, nonce, sharedKey);
        if (!decryptedTextBytes) throw new Error("Decryption failed for new message");

        const decryptedText = decodeUTF8(decryptedTextBytes);
        const decryptedMessage = { ...newMessage, text: decryptedText };

        set({ messages: [...messages, decryptedMessage] });
      } catch (error) {
        console.error("Error decrypting new message:", error);
        // Optionally show a toast notification for decryption failure
        toast.error("Failed to decrypt an incoming message.");
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("newMessage");
    }
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
