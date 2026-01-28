# SQL Terminal Pro - AI-Powered Database Management

A modern, professional SQL terminal with integrated AI query generation powered by Google's Gemini 2.0 Flash model.

## Features

- **Real-Time SQL Execution**: Execute SQL queries instantly with live results
- **AI Query Generation**: Convert natural language to optimized SQL queries
- **Interactive Chat Interface**: Conversational AI assistant for database operations
- **Safety First**: Built-in validation prevents destructive operations
- **Modern UI**: Professional, responsive design with smooth animations
- **Mobile Responsive**: Works seamlessly on all devices

## Tech Stack

- **Backend**: Flask, MySQL, Google Generative AI (Gemini 2.0)
- **Frontend**: HTML5, CSS3 (custom animations), Vanilla JavaScript
- **Fonts**: JetBrains Mono, Outfit
- **Icons**: Custom SVG icons

## Project Structure

```
sql-terminal/
├── app.py                 # Flask application
├── requirements.txt       # Python dependencies
├── templates/
│   ├── landing.html      # Landing page
│   └── terminal.html     # SQL terminal interface
├── static/
│   ├── css/
│   │   ├── base.css      # Base styles and variables
│   │   ├── landing.css   # Landing page styles
│   │   └── terminal.css  # Terminal interface styles
│   └── js/
│       ├── landing.js    # Landing page scripts
│       └── terminal.js   # Terminal functionality
└── .env                  # Environment variables (create this)
```

## Setup Instructions

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DB=your_database_name

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Optional: Flask Secret Key
SECRET_KEY=your_secret_key_here
```

### 3. Get Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to your `.env` file

### 4. Set Up MySQL Database

Ensure you have MySQL installed and running. Create a database and configure the credentials in your `.env` file.

### 5. Organize Files

Create the following directory structure:

```
your-project/
├── app.py
├── requirements.txt
├── .env
├── templates/
│   ├── landing.html
│   └── terminal.html
└── static/
    ├── css/
    │   ├── base.css
    │   ├── landing.css
    │   └── terminal.css
    └── js/
        ├── landing.js
        └── terminal.js
```

### 6. Run the Application

```bash
python app.py
```

The application will be available at `http://localhost:5000`

## Usage

### Executing SQL Queries

1. Navigate to the terminal (`/terminal`)
2. Type or paste your SQL query in the editor
3. Click "Execute Query" or press `Ctrl+Enter`
4. View results in the right panel

### Using AI Query Generation

1. Type a natural language description in the query editor
   - Example: "Show me all active users from last month"
2. Click "Ask AI"
3. The AI will generate an optimized SQL query
4. Review and execute the generated query

### Keyboard Shortcuts

- `Ctrl + Enter` / `Cmd + Enter`: Execute current query

## Security Features

- Query validation to prevent destructive operations
- Blocked dangerous commands (DROP DATABASE, TRUNCATE DATABASE, etc.)
- Safe error handling and display
- Input sanitization

## Design Features

- **Modern Dark Theme**: Professional color scheme optimized for extended use
- **Smooth Animations**: CSS-only animations for performance
- **Responsive Layout**: Mobile-first design approach
- **Custom Typography**: JetBrains Mono for code, Outfit for UI
- **SVG Icons**: Scalable, crisp icons throughout the interface
- **Accessible**: Focus states and semantic HTML

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Development

### CSS Architecture

- `base.css`: CSS variables, global styles, reusable components
- `landing.css`: Landing page specific styles
- `terminal.css`: Terminal interface styles

### JavaScript Architecture

- `landing.js`: Landing page animations and interactions
- `terminal.js`: Terminal functionality, API calls, result rendering

## Troubleshooting

### AI Query Generation Fails

- Verify your Gemini API key is correct in `.env`
- Check that you have API quota remaining
- Ensure the model name is correct: `gemini-2.0-flash-exp`

### Database Connection Issues

- Verify MySQL credentials in `.env`
- Ensure MySQL server is running
- Check database exists and user has proper permissions

### Static Files Not Loading

- Verify file structure matches the expected layout
- Check Flask static file serving configuration
- Clear browser cache

## License

This project is provided as-is for educational and development purposes.

## Credits

- Powered by Google Gemini 2.0 Flash
- Icons: Custom SVG designs
- Fonts: Google Fonts (JetBrains Mono, Outfit)