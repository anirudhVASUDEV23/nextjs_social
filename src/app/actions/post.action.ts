"use server";
import { revalidatePath } from "next/cache";
import { getDbUserId } from "./user.action";
import prisma from "@/lib/prisma";

export async function createPost(content: string, image: string) {
  try {
    const userId = await getDbUserId();
    if (!userId) return;
    const post = await prisma.post.create({
      data: { content, authorId: userId, image },
    });

    revalidatePath("/");
    return { success: true, post };
  } catch (error) {
    console.log("Error creating post:", error);
  }
}

export async function getPosts() {
  try {
    const userId = await getDbUserId();
    if (!userId) return [];
    console.time("getPosts");
    const posts = await prisma.post.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        likes: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });
    console.timeEnd("getPosts");
    return posts;
  } catch (error) {
    console.log("Error fetching posts:", error);
    throw new Error("Error fetching posts");
  }
}

export const toggleLike = async (postId: string) => {
  try {
    const userId = await getDbUserId();
    if (!userId) return;

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
    });
    if (!post) return;

    const postCreatorId = post?.authorId;
    if (!postCreatorId) return;

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: userId,
          postId: postId,
        },
      },
    });

    if (existingLike) {
      //unlike
      await prisma.like.delete({
        where: {
          userId_postId: {
            userId: userId,
            postId: postId,
          },
        },
      });
    } else {
      //like and also create a notification record for this like either both should happen or both should fail,use transaction
      await prisma.$transaction([
        prisma.like.create({
          data: {
            userId: userId,
            postId: postId,
          },
        }),
        ...(postCreatorId !== userId ///checking if we liked our post,if yes no notif will be created
          ? [
              prisma.notification.create({
                data: {
                  type: "LIKE",
                  userId: postCreatorId as string,
                  creatorId: userId,
                  postId: postId,
                },
              }),
            ]
          : []),
      ]);
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.log("Error toggling the post:", error);
  }
};

export const createComment = async (postId: string, content: string) => {
  try {
    const userId = await getDbUserId();
    if (!userId) return;
    if (!content) throw new Error("Comment cannot be empty");

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) throw new Error("Post not found");

    //create comment and notification record for this comment either both should happen or both should fail,use transaction

    const [comment] = await prisma.$transaction(async (tx) => {
      //create comment first
      const newComment = await tx.comment.create({
        data: {
          content,
          authorId: userId,
          postId: postId,
        },
      });

      //create a notification record for the comment if the post is not created by the logged in user
      if (post.authorId !== userId) {
        await tx.notification.create({
          data: {
            type: "COMMENT",
            userId: post.authorId,
            creatorId: userId,
            postId: postId,
            commentId: newComment.id,
          },
        });
      }
      return [newComment];
    });

    revalidatePath("/");
    return { success: true, comment };
  } catch (error) {
    console.log("Error creating comment:", error);
    return { success: false, error: "Error creating comment" };
  }
};

export async function deletePost(postId: string) {
  try {
    const userId = await getDbUserId();

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        authorId: true,
      },
    });

    if (!post) throw new Error("Post not found");
    if (post.authorId !== userId) throw new Error("Unauthorized");

    await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.log("Error deleting post:", error);
    return { success: false, error: "Error deleting post" };
  }
}
