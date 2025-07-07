"use server";

import prisma from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

//this creates a user in the db
export async function syncUser() {
  try {
    const { userId } = await auth();
    const user = await currentUser();
    console.log(
      user?.emailAddresses[0].emailAddress.split("@")[0].split(".")[0]
    );

    if (!user || !userId) return;

    //check if user is in dbUser
    const existingUser = await prisma.user.findUnique({
      where: {
        clerkId: userId,
      },
    });

    if (existingUser) return existingUser;

    const dbUser = await prisma.user.create({
      data: {
        clerkId: userId,
        name: `${user.firstName || ""} ${user.lastName || ""} `,
        username:
          user.username ||
          user?.emailAddresses[0].emailAddress.split("@")[0].split(".")[0],
        image: user.imageUrl,
        email: user.emailAddresses[0].emailAddress,
      },
    });

    return dbUser;
  } catch (error) {
    console.log("Error syncing user:", error);
  }
}

//this fetches the details of the user when given the clerkId attribute of the user which can be easily get by auth() from clerk
export async function getUserByClerkId(clerkId: string) {
  try {
    return await prisma.user.findUnique({
      where: {
        clerkId: clerkId,
      },
      include: {
        posts: true,
        followers: true,
        following: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });
  } catch (error) {
    console.log("Error syncing user:", error);
  }
}

//this fetches the id of the user logged in
export async function getDbUserId() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const user = await getUserByClerkId(clerkId);
  return user?.id;
}

//gets random users

export async function getRandomUsers() {
  try {
    const userId = await getDbUserId();
    if (!userId) return [];
    const randomUsers = await prisma.user.findMany({
      where: {
        AND: [
          {
            NOT: { id: userId },
          },
          {
            NOT: { followers: { some: { followerId: userId } } },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        _count: {
          select: {
            followers: true,
          },
        },
      },
      take: 3,
    });
    console.log("Random Users", randomUsers);
    return randomUsers;
  } catch (error) {
    console.log("Error fetching random users", error);
  }
}

export async function toggleFollow(targetUserId: string) {
  try {
    const userId = await getDbUserId();
    if (!userId) return;
    if (userId === targetUserId) throw new Error("Cannot follow yourself");

    const existingFollow = await prisma.follows.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      //unfollow
      await prisma.follows.delete({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId: targetUserId,
          },
        },
      });
    } else {
      //follow
      //create a notif and follow records both either both of them should succed or none
      await prisma.$transaction([
        prisma.follows.create({
          data: {
            followerId: userId,
            followingId: targetUserId,
          },
        }),
        prisma.notification.create({
          data: {
            type: "FOLLOW",
            userId: targetUserId, //who gets the notif
            creatorId: userId, //who triggers the notif
          },
        }),
      ]);
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.log("Error following user:", error);
    return { success: false };
  }
}
