import { prisma } from "../db/client.js";

const DEFAULT_USER_EMAIL =
  process.env.DEFAULT_USER_EMAIL ?? "local@ai-pro-agent.dev";

export async function getCurrentUser() {
  const existingUser = await prisma.user.findUnique({
    where: {
      email: DEFAULT_USER_EMAIL,
    },
  });

  if (existingUser) return existingUser;

  try {
    return await prisma.user.create({
      data: {
        email: DEFAULT_USER_EMAIL,
        name: "Local User",
      },
    });
  } catch (error) {
    const user = await prisma.user.findUnique({
      where: {
        email: DEFAULT_USER_EMAIL,
      },
    });

    if (user) return user;
    throw error;
  }
}
