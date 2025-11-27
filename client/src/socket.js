import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SERVER_URL || "http://157.245.51.151:3001";
export const socket = io(URL, { autoConnect: true });
