// Middleware ตรวจสอบฟิลด์ที่จำเป็นใน Request Body
function requireFields(fields = []) {
    return (req, res, next) => {
        const missingFields = fields.filter(field => !req.body || req.body[field] === undefined || req.body[field] === '');
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing required fields',
                    details: missingFields.map(f => ({ field: f, message: `${f} is required` }))
                }
            });
        }
        next();
    };
}

module.exports = { requireFields };