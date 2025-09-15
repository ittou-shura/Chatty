import axios from "axios";

export const axiosInstance = axios.create({
  baseURL: "https://chatwebb.onrender.com/api",
  withCredentials: true,
});
