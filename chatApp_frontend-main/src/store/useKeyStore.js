import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

export const useKeyStore = create((set, get) => ({
  publicKeys: {},

  getPublicKey: async (userId) => {
    const { publicKeys } = get();
    if (publicKeys[userId]) {
      return publicKeys[userId];
    }

    try {
      const res = await axiosInstance.get(`/users/public-key/${userId}`);
      const { publicKey } = res.data;
      set((state) => ({
        publicKeys: { ...state.publicKeys, [userId]: publicKey },
      }));
      return publicKey;
    } catch (error) {
      toast.error(error.response.data.message);
      return null;
    }
  },
}));