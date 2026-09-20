# 💬 GOLPO

> A modern real-time chat application built with React, Node.js, MongoDB and Socket.io.

GOLPO is a full-stack real-time messaging application designed with a modern, responsive interface and a scalable client-server architecture. It supports secure authentication, real-time messaging, image sharing, customizable themes and wallpapers, online presence indicators, and more.

live : https://golpooo.vercel.app/
---

## ✨ Features

- 🔐 Secure user authentication with Clerk
- 💬 Real-time messaging with Socket.io
- 🟢 Online/offline user presence
- 🖼️ Image sharing with ImageKit
- 🎙️ Voice messages (record and send voice notes in DMs and groups)
- 📸 Status updates — image stories that expire after 24 hours, with a glowing ring on unseen ones
- 🎨 Customizable themes
- 🖥️ Custom chat wallpapers
- 🔊 Keyboard and interaction sounds
- 📱 Responsive chat interface
- ⚡ Fast and reactive UI with React
- 🗄️ MongoDB-based data persistence
- 🔄 Global state management with Zustand
- 🧩 Reusable React components
- 🛡️ Protected backend routes and authentication middleware
- 🌐 REST API with Express.js
- ☁️ Cloud deployment ready with Docker and Render

---

## 📸 Status updates

Statuses are images that stay up for 24 hours and are visible only to
people you already chat with (a DM partner, or a member of a group you
share). An unseen status puts a glowing orange ring around that person's
avatar in the sidebar; opening it marks it seen and the ring goes grey.

Expiry is enforced on every read, so a status is never served past its
24 hours. Cleaning up the underlying ImageKit assets is a separate
sweep (`backend/src/lib/statusCleanup.js`): it deletes each expired
image from ImageKit and only then drops the database row, since the row
holds the `fileId` the delete needs.

- **On a normal server (Render, Docker, local):** nothing to configure.
  The sweep runs every 10 minutes and once at startup.
- **On serverless (Vercel):** no long-lived process means no in-process
  cron, so point a scheduled job at `/api/status/cleanup` (GET or POST).
  Set a `CRON_SECRET` env var and send it as `Authorization: Bearer
  <CRON_SECRET>`; without that variable the endpoint returns 404 and is
  effectively off. Hourly is plenty.

If the sweep never runs at all, a TTL index still drops status rows
seven days after expiry as a backstop — the app stays correct, but those
ImageKit files would be left orphaned, which is what the sweep exists to
prevent.

---

## 🛠️ Tech Stack

### Frontend

- **React** – UI development
- **Tailwind CSS** – Styling and responsive design
- **Hero UI** – UI component library
- **Zustand** – Global state management
- **Socket.io Client** – Real-time communication
- **Axios** – HTTP requests
- **Vite** – Frontend build tool

### Backend

- **Node.js** – JavaScript runtime
- **Express.js** – REST API framework
- **MongoDB** – Database
- **MongoDB Atlas** – Cloud database hosting
- **Socket.io** – Real-time communication
- **Clerk** – Authentication and user management
- **ImageKit** – Image upload and delivery

### Deployment

- **Frontend:** Render
- **Backend:** Render
- **Database:** MongoDB Atlas
- **Containerization:** Docker

---

# 📂 Project Structure

```text
GOLPO/
│
├── frontend/
│   │
│   ├── public/
│   │   ├── sounds/
│   │   ├── wallpapers/
│   │   ├── auth.png
│   │   ├── favicon.svg
│   │   ├── icons.svg
│   │   ├── logo.png
│   │   └── screenshot-for-readme.png
│   │
│   ├── src/
│   │   │
│   │   ├── assets/
│   │   │
│   │   ├── components/
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── AuthActionPanel.jsx
│   │   │   │   ├── AuthCardShell.jsx
│   │   │   │   ├── AuthHeader.jsx
│   │   │   │   ├── AuthHeroPanel.jsx
│   │   │   │   └── AuthHeroPattern.jsx
│   │   │   │
│   │   │   ├── chat/
│   │   │   │   ├── AvatarWithOnlineIndicator.jsx
│   │   │   │   ├── ChatComposer.jsx
│   │   │   │   ├── ChatHeader.jsx
│   │   │   │   ├── ChatSidebar.jsx
│   │   │   │   ├── ConversationRow.jsx
│   │   │   │   ├── MessageBubble.jsx
│   │   │   │   ├── MessageList.jsx
│   │   │   │   ├── MessageVideo.jsx
│   │   │   │   └── NoConversationPlaceholder.jsx
│   │   │   │
│   │   │   ├── AppLogo.jsx
│   │   │   ├── PageLoader.jsx
│   │   │   ├── ThemePresetPicker.jsx
│   │   │   ├── ThemeToggle.jsx
│   │   │   └── WallpaperPicker.jsx
│   │   │
│   │   ├── context/
│   │   │   ├── theme.js
│   │   │   ├── ThemeContext.jsx
│   │   │   ├── wallpaper.js
│   │   │   └── WallpaperContext.jsx
│   │   │
│   │   ├── data/
│   │   │   ├── herouiThemePresets.js
│   │   │   └── wallpapers.js
│   │   │
│   │   ├── hooks/
│   │   │   ├── useKeyboardSound.js
│   │   │   ├── useMediaQuery.js
│   │   │   ├── useScrollToBottom.js
│   │   │   └── useSelectedConversation.js
│   │   │
│   │   ├── lib/
│   │   │   ├── axios.js
│   │   │   ├── imagekit.js
│   │   │   └── utils.js
│   │   │
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx
│   │   │   └── ChatPage.jsx
│   │   │
│   │   ├── store/
│   │   │   ├── useAuthStore.js
│   │   │   └── useChatStore.js
│   │   │
│   │   ├── styles/
│   │   │   └── heroui-theme-presets.css
│   │   │
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── .env
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── Dockerfile
│   └── .dockerignore
│
├── backend/
│   │
│   ├── src/
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   └── message.controller.js
│   │   │
│   │   ├── lib/
│   │   │   ├── cron.js
│   │   │   ├── db.js
│   │   │   ├── imagekit.js
│   │   │   └── socket.js
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   └── upload.middleware.js
│   │   │
│   │   ├── models/
│   │   │   ├── message.model.js
│   │   │   └── user.model.js
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.route.js
│   │   │   └── message.route.js
│   │   │
│   │   ├── seeds/
│   │   │   └── user.seed.js
│   │   │
│   │   ├── webhooks/
│   │   │   └── clerk.webhook.js
│   │   │
│   │   └── index.js
│   │
│   ├── .env
│   ├── package.json
│   ├── Dockerfile
│   └── .dockerignore
│
├── .gitignore
└── README.md
