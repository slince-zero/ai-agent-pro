import { prisma } from '../db/client.js'
import { env } from '../env.js'

export async function getCurrentUser() {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'DEFAULT_USER_EMAIL is only available outside production; use an authenticated session instead.',
    )
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: env.DEFAULT_USER_EMAIL,
    },
  })

  if (existingUser) return existingUser

  try {
    return await prisma.user.create({
      data: {
        email: env.DEFAULT_USER_EMAIL,
        name: 'Local User',
      },
    })
  } catch (error) {
    const user = await prisma.user.findUnique({
      where: {
        email: env.DEFAULT_USER_EMAIL,
      },
    })

    if (user) return user
    throw error
  }
}
