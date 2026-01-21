import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors"; // อย่าลืม bun add @elysiajs/cors
import { authRoutes } from "./auth";

const app = new Elysia()
  .use(
    cors({
      // 🔒 ระบุ Domain ของ Frontend ให้ชัดเจน (ห้ามใช้ *)
      origin: [
        "http://localhost:5173", // Vite / React / Vue Localhost
        "http://localhost:3000", // ตัว Backend เอง (สำหรับการทดสอบ)
        "https://test-frontend-pied-nu.vercel.app/", // Domain จริงตอน Deploy
      ],
      // 🔑 อนุญาตให้รับ-ส่ง Cookie/Session
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // (เผื่อไว้) ระบุ method ที่ยอมรับ
      // อนุญาต Header ที่จำเป็น
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(swagger())
  .use(authRoutes);

// For Vercel / Production
export default app;

// For Type Frontend
export type App = typeof app;

// For local dev
if (import.meta.main || process.env.NODE_ENV !== "production") {
  app.listen(3000);
  console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  );
}
