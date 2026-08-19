const fetch = require('node-fetch');

// مصفوفة بسيطة في الذاكرة لتجنب التكرار (أو يمكنك ربطها بـ Upstash Redis مجاني)
let sentItemsCache = new Set();

module.exports = async (req, res) => {
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: "DISCORD_WEBHOOK_URL is not set" });
  }

  try {
    // 1. جلب العناصر المجانية من Catalog API
    const catalogUrl = "https://catalog.roblox.com/v1/search/items/details?Category=1&MaxPrice=0&SortType=3&Limit=10";
    const response = await fetch(catalogUrl);
    
    if (!response.ok) {
      throw new Error(`Roblox API Error: ${response.status}`);
    }

    const data = await response.json();
    const items = data.data || [];

    if (items.length === 0) {
      return res.status(200).json({ message: "No free items found" });
    }

    // 2. تصفية العناصر وإرسال الجديد فقط
    for (const item of items) {
      const itemId = item.id;

      // تحقق إذا تم إرساله مسبقاً
      if (sentItemsCache.has(itemId)) {
        continue;
      }

      // 3. جلب صورة العنصر من Roblox Thumbnails API
      const thumbUrl = `https://thumbnails.roblox.com/v1/assets?assetIds=${itemId}&size=420x420&format=Png&isCircular=false`;
      let imageUrl = "https://www.roblox.com/images/default-thumbnail.png";
      
      try {
        const thumbRes = await fetch(thumbUrl);
        const thumbData = await thumbRes.json();
        if (thumbData.data && thumbData.data[0] && thumbData.data[0].imageUrl) {
          imageUrl = thumbData.data[0].imageUrl;
        }
      } catch (e) {
        console.error("Failed to load thumbnail", e);
      }

      const itemLink = `https://www.roblox.com/catalog/${itemId}`;
      const itemPrice = item.price === 0 ? "مجاني (FREE) 🎁" : `${item.price} Robux`;

      // 4. تجهيز رسالة الـ Embed لديسكورد
      const discordEmbed = {
        username: "Roblox Free Finder 🤖",
        avatar_url: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Roblox_player_icon_black.svg",
        embeds: [
          {
            title: `🔥 عنصر مجاني جديد: ${item.name}`,
            url: itemLink,
            description: item.description ? (item.description.slice(0, 200) + "...") : "لا يوجد وصف متاح.",
            color: 5763719, // لون أخضر Emerald
            fields: [
              {
                name: "💰 السعر",
                value: itemPrice,
                inline: true
              },
              {
                name: "🆔 Item ID",
                value: `\`${itemId}\``,
                inline: true
              },
              {
                name: "🔗 الرابط المباشر",
                value: `[اضغط هنا للحصول على العنصر](${itemLink})`
              }
            ],
            image: {
              url: imageUrl
            },
            footer: {
              text: "منبه روبلوكس المجاني • Vercel Tracker"
            },
            timestamp: new Date().toISOString()
          }
        ]
      };

      // 5. إرسال الرسالة إلى Discord
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordEmbed)
      });

      // حفظ الـ ID لمنع تكراره
      sentItemsCache.add(itemId);
    }

    return res.status(200).json({ success: true, checkedCount: items.length });
  } catch (error) {
    console.error("Error running tracker:", error);
    return res.status(500).json({ error: error.message });
  }
};
