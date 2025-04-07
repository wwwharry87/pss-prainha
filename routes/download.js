// routes/download.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.get('/:filename', (req, res) => {
  // Usa a variável de ambiente UPLOADS_DIR se estiver definida; caso contrário, usa a pasta local "uploads" a partir do diretório de trabalho
  const uploadDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadDir, req.params.filename);
  
  console.log("Buscando arquivo em:", filePath); // Para depuração
  
  if (fs.existsSync(filePath)) {
    // Se o parâmetro preview estiver definido, envia o arquivo inline para visualização
    if (req.query.preview === "true") {
      res.sendFile(filePath);
    } else {
      res.download(filePath);
    }
  } else {
    res.status(404).json({ 
      success: false,
      message: 'Arquivo não encontrado',
      filePath // para depuração
    });
  }
});

module.exports = router;
