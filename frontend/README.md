# 💬 GOLPO

> A modern real-time chat application built with React, Node.js, MongoDB and Socket.io.

GOLPO is a full-stack real-time messaging application designed with a modern, responsive interface and a scalable client-server architecture. It supports secure authentication, real-time messaging, image sharing, customizable themes and wallpapers, online presence indicators, and more.

---

## ✨ Features

- 🔐 Secure user authentication with Clerk
- 💬 Real-time messaging with Socket.io
- 🟢 Online/offline user presence
- 🖼️ Image sharing with ImageKit
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