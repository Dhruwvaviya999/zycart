import { prisma } from "@/lib/prisma";
import { inngest } from "./client";

export const syncUserCreation = inngest.createFunction(
  { id: "sync-user-create" },
  { event: "clerk/user.created" },
  async ({ event, step }) => {
    const {data } = event;
    await prisma.user.create({
        data: {
            id: data.id,
            email: data.email_addresses[0]?.email_addresses,
            name: `${data.first_name} ${data.last_name}`,
            image: data.image.url
        }
    })
  },
);

// Inngest function to sync user updates from Clerk to the database
export const syncUserUpdation = inngest.createFunction(
  { id: "sync-user-update" },
  { event: "clerk/user.updated" },
  async ({ event, step }) => {
    const {data } = event;
    await prisma.user.update({
        where: {
            id: data.id
        },
        data: {
            email: data.email_addresses[0]?.email_addresses,
            name: `${data.first_name} ${data.last_name}`,
            image: data.image.url
        }
    })
  },
);

// Inngest function to sync user deletions from Clerk to the database
export const syncUserDeletion = inngest.createFunction(
  { id: "sync-user-delete" },
  { event: "clerk/user.deleted" },
    async ({ event, step }) => {
    const {data } = event;
    await prisma.user.delete({
        where: {
            id: data.id
        }
    })
  }
);