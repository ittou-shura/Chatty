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
			const res = await axiosInstance.get("/users");
			const currentUser = useAuthStore.getState().user;
			const otherUsers = res.data.filter((user) => user._id !== currentUser._id);
			set({ users: otherUsers });
		} catch (error) {
			toast.error(error.response.data.message);
		} finally {
			set({ isUsersLoading: false });
		}
	},

	selectUser: (user) => {
		set({ selectedUser: user, messages: [] });
		get().getMessages(user._id);
	},

	getMessages: async (otherUserId) => {
		set({ isMessagesLoading: true });
		try {
			const otherUserPublicKey = await useKeyStore.getState().getPublicKey(otherUserId);

			const sharedKey = await getSharedKey(otherUserPublicKey);

			const res = await axiosInstance.get(`/messages/${otherUserId}`);
			const messages = res.data;

			const decryptedMessages = messages.map((message) => {
				const nonce = decodeBase64(message.nonce);
				const ciphertext = decodeBase64(message.content);
				const plaintextBytes = nacl.box.open.after(ciphertext, nonce, sharedKey);
				const plaintext = decodeUTF8(plaintextBytes);
				return { ...message, content: plaintext };
			});

			set({ messages: decryptedMessages });
		} catch (error) {
			if (error.response?.data?.message) {
				toast.error(error.response.data.message);
			} else {
				toast.error("An error occurred while fetching messages.");
			}
		} finally {
			set({ isMessagesLoading: false });
		}
	},

	sendMessage: async (content, receiverId) => {
		try {
			const otherUserPublicKey = await useKeyStore.getState().getPublicKey(receiverId);
			const sharedKey = await getSharedKey(otherUserPublicKey);

			const nonce = nacl.randomBytes(nacl.box.nonceLength);
			const messageBytes = encodeUTF8(content);
			const ciphertext = nacl.box.after(messageBytes, nonce, sharedKey);

			const res = await axiosInstance.post("/messages", {
				content: encodeBase64(ciphertext),
				receiverId,
				nonce: encodeBase64(nonce),
			});
			const newMessage = res.data;
			const decryptedMessage = {
				...newMessage,
				content,
			};

			set((state) => ({ messages: [...state.messages, decryptedMessage] }));
		} catch (error) {
			if (error.response?.data?.message) {
				toast.error(error.response.data.message);
			} else {
				toast.error("An error occurred while sending the message.");
			}
		}
	},
}));