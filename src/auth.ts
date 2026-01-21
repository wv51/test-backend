import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { bearer } from "@elysiajs/bearer";

import bcrypt from "bcryptjs";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "🔑-change-me-to-a-strong-key";
const COOKIE_SECRET =
  process.env.COOKIE_SECRET || "🍪-change-me-to-another-strong-key";

export const authRoutes = new Elysia({
  // 1. Config Cookie แบบ Global (Elysia 1.0+)
  cookie: {
    secrets: COOKIE_SECRET,
    sign: ["session"], // Sign cookie เพื่อป้องกันการปลอมแปลง
  },
})
  // 2. ติดตั้ง Plugins
  .use(bearer()) // รองรับ Authorization: Bearer <token>
  .use(
    jwt({
      name: "jwt",
      secret: JWT_SECRET,
      exp: "7d", // Token หมดอายุ 7 วัน
    }),
  )

  // 🔹 REGISTER
  .post(
    "/register",
    async ({ body, set }) => {
      const { name, email, password } = body;

      // เช็คว่ามี Email นี้หรือยัง
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        set.status = 409;
        return { error: "Email already used" };
      }

      // Hash Password
      const passwordHash = await bcrypt.hash(password, 10);

      // สร้าง User
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
        },
      });

      return {
        ok: true,
        userId: user.id,
        message: "Registration successful",
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
      }),
    },
  )

  // 🔹 LOGIN
  .post(
    "/login",
    async ({ body, jwt, set, cookie: { session } }) => {
      const { email, password } = body;

      // หา User จาก Email
      const user = await prisma.user.findUnique({
        where: { email },
      });

      // ตรวจสอบ Password
      if (!user || !(await bcrypt.compare(password, user.password))) {
        set.status = 401;
        return { error: "user or password not correct" };
      }

      // สร้าง JWT Token
      const token = await jwt.sign({ sub: user.id });

      // 👇 แก้ไขตรงนี้ครับ: เช็ค NODE_ENV หรือ VERCEL (เพราะ Vercel จะมี env นี้ให้เสมอ)
      const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

      // ✅ 1. ส่ง Token ผ่าน Cookie
      session.value = token;
      session.path = "/";
      session.httpOnly = true;
      session.maxAge = 60 * 60 * 24 * 7; // 7 วัน

      // 🚨 จุดตัดสินใจ:
      // ถ้าอยากให้ชัวร์บน Vercel ให้บังคับเป็น true/'none' ไปเลย
      // แต่ถ้าอยากให้ Test Localhost ได้ด้วย ให้ใช้ Logic นี้ครับ:

      if (isProduction) {
        session.secure = true;       // ต้อง true บน https
        session.sameSite = "none";   // ต้อง none เพื่อข้ามโดเมน
      } else {
        session.secure = false;      // false บน http localhost
        session.sameSite = "lax";    // lax บน localhost
      }

      // ✅ 2. Return Token ใน Response (สำหรับ Mobile/API)
      return {
        ok: true,
        token,
        userId: user.id,
        name: user.name,
        email: user.email,
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  )

  // 🔹 LOGOUT
  .post("/logout", ({ cookie: { session } }) => {
    session.remove();
    return { ok: true, message: "Logged out successfully" };
  })

  // =========================================================
  // 🔹 Protected Routes (Hybrid: Cookie + Bearer)
  // =========================================================

  // =========================================================
  // 🔹 Protected Routes (แก้ใหม่: ใช้ Chaining เพื่อ Type Safe)
  // =========================================================

  // 1. Derive: แปลง Token เป็น userId (เหมือนเดิม)
  .derive(async ({ cookie, bearer, jwt }) => {
    const token = bearer || cookie.session?.value;

    if (!token || typeof token !== "string") {
      return { userId: null };
    }

    const payload = await jwt.verify(token);
    if (!payload) {
      return { userId: null };
    }

    return { userId: payload.sub as string };
  })

  // 2. Guard Check: ดักจับตรงนี้เลย (TypeScript จะเข้าใจ Context ตรงนี้ดีกว่า)
  .onBeforeHandle(({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })

  // 3. Routes: เขียนต่อได้เลย (userId จะมีค่าแน่นอนเพราะผ่านด่านบนมาแล้ว)
  .get("/me", async ({ userId, set }) => {
    // ใช้ ! เพื่อบอก TypeScript ว่าเรามั่นใจว่า userId ไม่ใช่ null แน่นอน (เพราะมี onBeforeHandle ดักไว้แล้ว)
    const id = userId!;

    const user = await prisma.user.findUnique({
      where: { id: id }, // ใช้ id ที่เรา assert แล้ว
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    return user;
  });
