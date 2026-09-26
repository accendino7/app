import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const setToken = (t) => {
  if (t) localStorage.setItem("sfida_token", t);
  else localStorage.removeItem("sfida_token");
};
export const getToken = () => localStorage.getItem("sfida_token");

client.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

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

// Auth + negozianti
export const login = (data) => client.post("/auth/login", data).then((r) => r.data);
export const getMe = () => client.get("/auth/me").then((r) => r.data);
export const getNegozianti = () => client.get("/negozianti").then((r) => r.data);
export const createNegoziante = (data) => client.post("/negozianti", data).then((r) => r.data);
export const deleteNegoziante = (id) => client.delete(`/negozianti/${id}`).then((r) => r.data);
export const getMyCoupons = () => client.get("/negoziante/coupons").then((r) => r.data);
export const negozianteRedeem = (code) => client.post("/negoziante/redeem", { code }).then((r) => r.data);
export const negozianteCreateCoupon = (data) => client.post("/negoziante/coupons", data).then((r) => r.data);
export const getCouponRequests = () => client.get("/coupon-requests").then((r) => r.data);
export const approveCoupon = (id) => client.post(`/coupons/${id}/approve`).then((r) => r.data);
export const rejectCoupon = (id) => client.post(`/coupons/${id}/reject`).then((r) => r.data);
