const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from workspace root
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  AI WARRIOR II (VIRABHADRASANA II) TRACKER - JS APP  `);
    console.log(`=======================================================`);
    console.log(`  Server running live at: http://localhost:${PORT}`);
    console.log(`  Open this URL in your web browser with a webcam.`);
    console.log(`=======================================================`);
});
