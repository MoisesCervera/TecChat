# TecChat

A WhatsApp-like chat application with modern features.

## Project Structure

- **client**: React frontend application
- **server**: Node.js backend server

## Features

- Real-time messaging
- User authentication
- File sharing (images, videos, documents, audio)
- Message status tracking
- Multi-language support
- Theming support

## Getting Started

### Prerequisites

- Node.js (v14+ recommended)
- npm or yarn

### Installation

1. Clone the repository
   ```
   git clone https://github.com/YourUsername/TecChat.git
   cd TecChat
   ```

2. Install dependencies
   ```
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```

3. Start the development servers
   ```
   # Start backend server (from /server directory)
   npm start

   # Start frontend server (from /client directory)
   npm start
   ```

## Environment Variables

Create a `.env` file in the server directory with:

```
PORT=3001
JWT_SECRET=your_jwt_secret
DB_TYPE=sqlite
```

## License

[MIT](LICENSE)
