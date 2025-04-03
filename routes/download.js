// routes/download.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.get('/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ 
      success: false,
      message: 'Arquivo não encontrado' 
    });
  }
});

module.exports = router;