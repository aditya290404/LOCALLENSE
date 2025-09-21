const express = require('express');
const router = express.Router();
const { authenticateToken, requireArtisan } = require('../middleware/auth');

// Helpers: mock AI responses if no API key is configured
const hasOpenAI = !!process.env.OPENAI_API_KEY;

// @route   POST /api/ai/description
// @desc    Generate product description and tags from title and optional brief
// @access  Private/Artisan
router.post('/description', authenticateToken, requireArtisan, async (req, res) => {
  try {
    const { title, brief, materials = [], techniques = [] } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!hasOpenAI) {
      // Mocked result
      return res.json({
        success: true,
        data: {
          description: `${title} — a handcrafted piece made with ${materials.join(', ') || 'care'} using ${techniques.join(', ') || 'traditional techniques'}. ${brief || 'Each item is unique with subtle variations that celebrate the artisan\'s touch.'}`,
          shortDescription: `Handcrafted ${title.toLowerCase()} with authentic artisan touch.`,
          tags: [title.split(' ')[0].toLowerCase(), 'handmade', 'artisan', 'local']
        }
      });
    }

    // TODO: Integrate with OpenAI SDK if desired
    return res.json({ success: true, data: { description: 'AI integration not configured', shortDescription: '', tags: [] } });
  } catch (error) {
    console.error('AI description error:', error);
    res.status(500).json({ success: false, message: 'Server error while generating description' });
  }
});

// @route   POST /api/ai/pricing
// @desc    Suggest pricing based on inputs
// @access  Private/Artisan
router.post('/pricing', authenticateToken, requireArtisan, async (req, res) => {
  try {
    const { baseCost = 0, hours = 1, hourlyRate = 300, materialQuality = 'standard', demand = 'medium' } = req.body;
    // Simple heuristic mock
    const materialMultiplier = materialQuality === 'premium' ? 1.4 : materialQuality === 'basic' ? 1.0 : 1.2;
    const demandMultiplier = demand === 'high' ? 1.3 : demand === 'low' ? 0.9 : 1.0;
    const suggested = (baseCost * materialMultiplier + hours * hourlyRate) * demandMultiplier;
    const rounded = Math.max(100, Math.round(suggested / 10) * 10);

    res.json({ success: true, data: { suggestedPrice: rounded, breakdown: { baseCost, hours, hourlyRate, materialMultiplier, demandMultiplier } } });
  } catch (error) {
    console.error('AI pricing error:', error);
    res.status(500).json({ success: false, message: 'Server error while suggesting pricing' });
  }
});

// @route   POST /api/ai/social
// @desc    Generate social media post drafts
// @access  Private/Artisan
router.post('/social', authenticateToken, requireArtisan, async (req, res) => {
  try {
    const { title, theme = 'launch', hashtags = [] } = req.body;
    const baseHash = ['#Handmade', '#SupportLocal', '#Artisan', '#LocalLense'];
    const tags = Array.from(new Set([...hashtags, ...baseHash]));

    const posts = [
      `New drop: ${title}! Crafted with love and rooted in tradition. ${tags.join(' ')}`,
      `${title} just went live. Every piece tells a story. Tap to shop small and make a big impact! ${tags.join(' ')}`,
      `From our hands to your home — ${title}. Limited pieces available. ${tags.join(' ')}`
    ];

    res.json({ success: true, data: { posts } });
  } catch (error) {
    console.error('AI social error:', error);
    res.status(500).json({ success: false, message: 'Server error while generating posts' });
  }
});

module.exports = router;
