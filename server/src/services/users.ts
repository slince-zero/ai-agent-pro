import { env } from "../env.js";
import { prisma } from "../db/client.js";

export async function getCurrentUser() {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: env.DEFAULT_USER_EMAIL,
    },
  });

  if (existingUser) return existingUser;

  try {
    return await prisma.user.create({
      data: {
        email: env.DEFAULT_USER_EMAIL,
        name: "Local User",
      },
    });
  } catch (error) {
    const user = await prisma.user.findUnique({
      where: {
        email: env.DEFAULT_USER_EMAIL,
      },
    });

    if (user) return user;
    throw error;
  }
}
