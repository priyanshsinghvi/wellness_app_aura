# Aura Backend: AI-Powered Mental Health Support 🧠

This is the backend server for **Aura**, an autonomous AI therapist providing personalized mental health support.

## 🚀 Technologies

- **Node.js & Express**: Core server framework.
- **TypeScript**: For type-safe development.
- **MongoDB & Mongoose**: Database for storing user sessions and therapy data.
- **OpenAI & LangChain**: Powering the AI therapist's conversational intelligence.
- **Inngest**: For reliable background job processing and workflows.
- **JWT**: Secure authentication system.

## 🛠 Features

- **Conversational AI Therapist**: Advanced therapeutic interactions using GPT-4.
- **Session Management**: Secure storage and retrieval of therapy history.
- **Inngest Workflows**: Automated processes for mental health analysis and feedback.
- **Secure Authentication**: Protected endpoints using JSON Web Tokens.
- **Comprehensive Logging**: Detailed monitoring using Winston and Morgan.

## 📦 Getting Started

1. **Clone & Install**
   ```bash
   git clone https://github.com/priyanshsinghvi/wellness_app_aura.git
   cd wellness_app_aura/backend
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file with the following variables:
   - `PORT`: Server port (default: 3001)
   - `MONGODB_URI`: Your MongoDB connection string
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `JWT_SECRET`: Secret key for JWT signing

3. **Run the Server**
   ```bash
   # Development mode
   npm run dev

   # Production build
   npm run build
   npm start
   ```

## 📂 Project Structure

- `src/index.ts`: Server entry point.
- `src/models/`: Database schemas.
- `src/routes/`: API endpoint definitions.
- `src/controllers/`: Business logic.
- `src/services/`: External integrations (AI, Database).
- `src/inngest/`: Background task definitions.
