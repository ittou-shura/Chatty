
import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { useKeyStore } from "./useKeyStore";
import * as nacl from "tweetnacl";
import { decodeBase64, encodeUTF8, decodeUTF8, encodeBase64 } from "tweetnacl-util";

const getSharedKey = async (otherUserPublicKeyB64) => {
  const secretKeyB64 = localStorage.getItem("secretKey");
  if (!secretKeyB64) throw new Error("Secret key not found");
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

  setSelectedUser: async (user) => {
    const { selectedUser } = get();
    if (selectedUser && selectedUser._id === user._id) return;

    set({ selectedUser: user, messages: [], isMessagesLoading: true });
    
    try {
      // STEP 1: Get the public key.
      const otherUserPublicKeyB64 = await useKeyStore.getState().getPublicKey(user._id);
      if (!otherUserPublicKeyB64) {
        throw new Error("Could not get public key for the selected user.");
      }

      // STEP 2: Get the shared key.
      const sharedKey = await getSharedKey(otherUserPublicKeyB64);

      // STEP 3: Fetch the messages.
      const res = await axiosInstance.get(`/messages/${user._id}`);
      const encryptedMessages = res.data;

      // STEP 4: Decrypt the messages.
      const decryptedMessages = encryptedMessages.map((message) => {
        if (message.text && message.nonce) {
          try {
            const nonce = decodeBase64(message.nonce);
            const encryptedText = decodeBase64(message.text);
            const decryptedTextBytes = nacl.secretbox.open(encryptedText, nonce, sharedKey);
            if (!decryptedTextBytes) throw new Error("Decryption failed");
            return { ...message, text: decodeUTF8(decryptedTextBytes) };
          } catch (e) {
            console.error("Failed to decrypt a message:", e);
            return { ...message, text: "[Unable to decrypt message]" };
          }
        }
        return message;
      });

      set({ messages: decryptedMessages });
    } catch (error) {
      toast.error(error.message || "Failed to load chat data.");
      set({ messages: [] });
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    if (!selectedUser) return toast.error("No user selected");

    try {
      const otherUserPublicKeyB64 = useKeyStore.getState().publicKeys[selectedUser._id];
      if (!otherUserPublicKeyB64) throw new Error("Public key not found for the recipient.");

      const sharedKey = await getSharedKey(otherUserPublicKeyB64);
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageBytes = encodeUTF8(messageData.text);
      const encryptedMessage = nacl.secretbox(messageBytes, nonce, sharedKey);

      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, {
        ...messageData,
        text: encodeBase64(encryptedMessage),
        nonce: encodeBase64(nonce),
      });

      const decryptedMessage = { ...res.data, text: messageData.text };
      set({ messages: [...messages, decryptedMessage] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.on("newMessage", async (newMessage) => {
      const { selectedUser, messages } = get();
      const authUser = useAuthStore.getState().authUser;

      const isFromSelectedUser = newMessage.senderId === selectedUser?._id;
      const isFromAuthUser = newMessage.senderId === authUser?._id;
      const isToSelectedUser = newMessage.receiverId === selectedUser?._id;
      const isToAuthUser = newMessage.receiverId === authUser?._id;

      if (!((isFromSelectedUser && isToAuthUser) || (isFromAuthUser && isToSelectedUser))) {
          return;
      }

      try {
        const keyUserId = newMessage.senderId === authUser._id ? selectedUser._id : newMessage.senderId;
        const publicKeyB64 = useKeyStore.getState().publicKeys[keyUserId];
        if (!publicKeyB64) throw new Error("Public key for new message not found.");
        
        const sharedKey = await getSharedKey(publicKeyB64);
        const nonce = decodeBase64(newMessage.nonce);
        const decryptedTextBytes = nacl.secretbox.open(decodeBase64(newMessage.text), nonce, sharedKey);
        if (!decryptedTextBytes) throw new Error("Decryption failed for new message");
        
        const decryptedText = decodeUTF8(decryptedTextBytes);
        const decryptedMessage = { ...newMessage, text: decryptedText };

        set((state) => ({ messages: [...state.messages, decryptedMessage] }));
      } catch (error) {
        console.error("Error decrypting new message:", error);
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
}));
