import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const getSfide = () => client.get("/sfide").then((r) => r.data);
export const createSfida = (data) => client.post("/sfide", data).then((r) => r.data);
export const getCoupons = () => client.get("/coupons").then((r) => r.data);
export const getCoupon = (code) => client.get(`/coupons/${code}`).then((r) => r.data);
export const createCoupon = (data) => client.post("/coupons", data).then((r) => r.data);
export const redeemCoupon = (code) => client.post("/coupons/redeem", { code }).then((r) => r.data);
export const getNotifications = () => client.get("/notifications").then((r) => r.data);
export const markRead = (id) => client.post(`/notifications/${id}/read`).then((r) => r.data);
export const markAllRead = () => client.post("/notifications/read-all").then((r) => r.data);
export const getSettings = () => client.get("/settings").then((r) => r.data);
export const updateSettings = (data) => client.put("/settings", data).then((r) => r.data);
export const getStats = () => client.get("/stats").then((r) => r.data);
