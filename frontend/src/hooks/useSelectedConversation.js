import { useMediaQuery } from "./useMediaQuery";
import { formatMessageTime } from "../lib/utils";
import { useChatStore } from "../store/useChatStore";
import { useGroupStore } from "../store/useGroupStore";
import { useAuthStore } from "../store/useAuthStore";

// John Doe -> JD
export function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((namePart) => namePart[0])
    .join("");
}

// mapUserToConversation is an adapter — it converts the raw backend shapes (a user document + an array of message documents) into the clean view-model that the chat UI components expect to render.

// Two transformations happen:
// 1. Messages → UI messages
// 2. User → peer

function mapUserToConversation({ user, messages, authUser, onlineUsers }) {
  const mappedMessages = messages.map((message) => {
    const isMe = String(message.senderId) === String(authUser?._id);
    const sender = isMe ? authUser : user;

    return {
      id: message._id,
      role: isMe ? "me" : "them",
      text: message.text || "",
      time: formatMessageTime(message.createdAt),
      createdAt: message.createdAt,
      imageUrl: message.image,
      videoUrl: message.video,
      seen: message.seen,
      senderAvatarUrl: sender?.profilePic,
      senderFullName: sender?.fullName,
    };
  });

  return {
    id: user._id,
    isGroup: false,
    peer: {
      _id: user._id, // Added for WebRTC/video calling
      name: user.fullName,
      subtitle: user.email,
      isOnline: onlineUsers.includes(user._id),
      avatarUrl: user.profilePic,
      initials: getInitials(user.fullName),
    },
    messages: mappedMessages,
  };
}

// Same idea as mapUserToConversation, but for a Group document + its
// GroupMessage array. senderId on a group message is populated (it's a
// full user doc minus clerkId), so we can pull a display name straight
// off each message to label who sent it.
function mapGroupToConversation({ group, messages, authUser }) {
  const mappedMessages = messages.map((message) => {
    const senderId = message.senderId?._id || message.senderId;
    const isMe = String(senderId) === String(authUser?._id);

    return {
      id: message._id,
      role: isMe ? "me" : "them",
      text: message.text || "",
      time: formatMessageTime(message.createdAt),
      createdAt: message.createdAt,
      imageUrl: message.image,
      videoUrl: message.video,
      senderName: isMe ? null : message.senderId?.fullName,
      senderAvatarUrl: isMe ? authUser?.profilePic : message.senderId?.profilePic,
      senderFullName: isMe ? authUser?.fullName : message.senderId?.fullName,
    };
  });

  const memberCount = group.members?.length || 0;

  return {
    id: group._id,
    isGroup: true,
    members: group.members,
    admin: group.admin,
    peer: {
      _id: group._id,
      name: group.name,
      subtitle: `${memberCount} member${memberCount === 1 ? "" : "s"}`,
      isOnline: true,
      avatarUrl: group.groupPic,
      initials: getInitials(group.name),
    },
    messages: mappedMessages,
  };
}

export function useSelectedConversation() {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore((state) => state.conversations);
  const users = useChatStore((state) => state.users);
  const messages = useChatStore((state) => state.messages);

  const activeGroupId = useGroupStore((state) => state.activeGroupId);
  const groups = useGroupStore((state) => state.groups);
  const groupMessages = useGroupStore((state) => state.groupMessages);

  const authUser = useAuthStore((state) => state.authUser);
  const onlineUsers = useAuthStore((state) => state.onlineUsers);

  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  if (activeGroupId) {
    const group = groups.find((g) => g._id === activeGroupId);
    const activeConversation = group
      ? mapGroupToConversation({ group, messages: groupMessages, authUser })
      : null;

    return {
      activeConversation,
      activeConversationId: activeGroupId,
      activeConversationType: "group",
      isLargeScreen,
    };
  }

  const selectedUser = activeConversationId
    ? users.find((user) => user._id === activeConversationId) ||
      conversations.find((user) => user._id === activeConversationId)
    : null;

  const activeConversation = selectedUser
    ? mapUserToConversation({
        user: selectedUser,
        messages,
        authUser,
        onlineUsers,
      })
    : null;

  return {
    activeConversation,
    activeConversationId,
    activeConversationType: "dm",
    isLargeScreen,
  };
}
