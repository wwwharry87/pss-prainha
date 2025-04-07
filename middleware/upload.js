// middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Usa a variável de ambiente UPLOADS_DIR ou, se não definida, utiliza a pasta local "uploads/"
    const uploadDir = process.env.UPLOADS_DIR || 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Somente arquivos PDF, JPG e PNG são permitidos'), false);
  }
  cb(null, true);
};

// Middleware para candidatos: somente o campo "laudo", limite 2MB
const uploadCandidatos = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
}).fields([
  { name: 'laudo', maxCount: 1 }
]);

const handleUploadCandidatos = (req, res, next) => {
  uploadCandidatos(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máximo 2MB)' : err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

// Middleware para inscrições: incluindo todos os campos que o formulário pode enviar, limite global 5MB
const uploadInscricoes = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).fields([
  { name: 'doc_identidade', maxCount: 1 },
  { name: 'doc_escolaridade', maxCount: 1 },
  { name: 'doc_diploma', maxCount: 1 },
  { name: 'doc_especifico', maxCount: 1 },
  { name: 'doc_especializacao', maxCount: 1 },
  { name: 'doc_mestrado', maxCount: 1 },
  { name: 'doc_doutorado', maxCount: 1 },
  { name: 'doc_plano_aula', maxCount: 1 },
  { name: 'doc_certificado', maxCount: 1 },
  { name: 'doc_certificado_fundamental', maxCount: 1 },
  { name: 'doc_certificado_medio', maxCount: 1 },
  { name: 'doc_certificado_fund_completo', maxCount: 1 },
  { name: 'doc_cursos', maxCount: 4 },
  { name: 'doc_pos', maxCount: 2 },
  { name: 'doc_qualificacao', maxCount: 2 },
  { name: 'doc_tempo_exercicio', maxCount: 1 },
  // Campos extras que estavam sendo enviados pelo formulário
  { name: 'doc_experiencia', maxCount: 1 },
  { name: 'doc_outros', maxCount: 1 }
]);

const handleUploadInscricoes = (req, res, next) => {
  uploadInscricoes(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: err.code === 'LIMIT_FILE_SIZE' ? 
          'Arquivo muito grande (máximo 2MB para documentos, 5MB para plano de aula)' : 
          err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

module.exports = {
  handleUploadCandidatos,
  handleUploadInscricoes
};
