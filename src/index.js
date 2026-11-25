const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const ALLOWED_CATEGORIES = [
  "دانشگاه",
  "خوابگاه",
  "خرید",
  "شخصی"
];

const AI_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "add_tasks",
        "list",
        "search",
        "done",
        "undone",
        "delete",
        "edit",
        "chat",
        "clarify"
      ]
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: {
            type: "string",
            enum: ["دانشگاه", "خوابگاه", "خرید", "شخصی"]
          },
          due_date: { type: "string" }
        },
        required: ["title", "category", "due_date"]
      }
    },
    target_id: { type: "string" },
    target_query: { type: "string" },
    query: { type: "string" },
    category_filter: { type: "string" },
    status_filter: {
      type: "string",
      enum: ["pending", "done", "all"]
    },
    filter_date: { type: "string" },
    edit_title: { type: "string" },
    edit_category: { type: "string" },
    edit_due_date: { type: "string" },
    clear_due_date: { type: "boolean" },
    reply: { type: "string" },
    clarification_question: { type: "string" }
  },
  required: [
    "intent",
    "tasks",
    "target_id",
    "target_query",
    "query",
    "category_filter",
    "status_filter",
    "filter_date",
    "edit_title",
    "edit_category",
    "edit_due_date",
    "clear_due_date",
    "reply",
    "clarification_question"
  ]
};

// ارسال پیام به تلگرام
async function sendTelegramMessage(env, chatId, text) {
  const safeText = String(text || "").slice(0, 4000);

  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: safeText,
        disable_web_page_preview: true
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    console.error("Telegram sendMessage error:", result);
    throw new Error("Telegram message could not be sent");
  }
}

// نرمال‌سازی متن فارسی برای مقایسه
function normalizePersianText(value) {
  return String(value || "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fa");
}

// بررسی اینکه عنوان استخراج‌شده واقعاً در پیام کاربر وجود دارد
function isTitleFromOriginalMessage(title, originalText) {
  const normalizedTitle = normalizePersianText(title);
  const normalizedMessage = normalizePersianText(originalText);

  if (!normalizedTitle || !normalizedMessage) {
    return false;
  }

  return normalizedMessage.includes(normalizedTitle);
}

// تاریخ امروز در منطقه زمانی تهران
function getTehranToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

// اضافه کردن تعداد روز به تاریخ میلادی
function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

// تشخیص تاریخ فهرست از متن کاربر
function extractFilterDate(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const today = getTehranToday();

  if (/پس\s*فردا/.test(value)) {
    return addDays(today, 2);
  }

  if (/فردا/.test(value)) {
    return addDays(today, 1);
  }

  if (/امروز/.test(value)) {
    return today;
  }

  return "";
}

// بررسی معتبر بودن تاریخ میلادی
function isValidDate(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// متن راهنما
function getHelpText() {
  return `سلام! به ابرنگار خوش اومدی 🌱

من دستیار هوشمند برنامه‌ریزی دانشگاه و خوابگاه هستم.

می‌تونی با زبان عادی با من صحبت کنی.

مثلاً:
فردا ساعت ۱۰ امتحان امنیت دارم
کارهای فردام رو نشون بده
کارهای انجام‌شده رو نشون بده
امتحان امنیت انجام شد
کار شماره ۲ رو حذف کن
موعد امتحان امنیت رو بذار فردا
عنوان تمرین شبکه رو به حل تمرین شبکه تغییر بده
دسته‌بندی خرید کتاب رو به دانشگاه تغییر بده
موعد پروژه رو پاک کن

دستورهای دستی:

/add عنوان کار
ثبت کار جدید

/list
نمایش کارهای انجام‌نشده

/search عبارت
جستجوی کارها

/done شماره
انجام‌شده کردن کار

/undone شماره
برگرداندن کار به فهرست انجام‌نشده‌ها

/del شماره
حذف کار

/help
راهنما

برای ثبت دستی همراه دسته‌بندی و موعد:
/add عنوان کار | دانشگاه | 2026-11-21

دسته‌بندی‌ها:
دانشگاه، خوابگاه، خرید، شخصی

نکته: شماره‌ها همان شماره‌های نمایشی فهرست هستند و بعد از تغییر فهرست دوباره مرتب می‌شوند.`;
}

// دریافت فهرست کارها با فیلترهای مختلف
async function getTasks(
  env,
  userId,
  status = "pending",
  category = "",
  dueDate = ""
) {
  let sql = `
    SELECT id, title, category, status, due_at
    FROM tasks
    WHERE telegram_user_id = ?
  `;

  const params = [userId];

  if (status === "pending" || status === "done") {
    sql += " AND status = ?";
    params.push(status);
  }

  if (ALLOWED_CATEGORIES.includes(category)) {
    sql += " AND category = ?";
    params.push(category);
  }

  if (dueDate && isValidDate(dueDate)) {
    sql += " AND due_at = ?";
    params.push(dueDate);
  }

  sql += `
    ORDER BY
      CASE WHEN due_at IS NULL OR due_at = '' THEN 1 ELSE 0 END ASC,
      due_at ASC,
      id ASC
    LIMIT 100
  `;

  const result = await env.abrnegar_db
    .prepare(sql)
    .bind(...params)
    .all();

  return result.results || [];
}

// ساخت متن فهرست با شماره‌های مرتب
function formatTaskList(tasks) {
  return tasks.map((task, index) => {
    const status = task.status === "done"
      ? "✅ انجام‌شده"
      : "⏳ انجام‌نشده";

    return (
      `${index + 1}. ${task.title}\n` +
      `دسته: ${task.category}\n` +
      `وضعیت: ${status}` +
      (task.due_at ? `\nموعد: ${task.due_at}` : "")
    );
  }).join("\n\n");
}

// نمایش فهرست کارها
async function showTasks(
  env,
  chatId,
  userId,
  status = "pending",
  category = "",
  dueDate = ""
) {
  const tasks = await getTasks(
    env,
    userId,
    status,
    category,
    dueDate
  );

  if (!tasks.length) {
    let message;

    if (status === "done") {
      message = "هنوز هیچ کاری را به‌عنوان انجام‌شده ثبت نکرده‌ای. 🌱";
    } else if (status === "all") {
      message = "هیچ کاری در فهرستت وجود ندارد.";
    } else {
      message = "🎉 هیچ کار انجام‌نشده‌ای در این فهرست نداری.";
    }

    if (dueDate) {
      message = `برای تاریخ ${dueDate} کاری پیدا نشد.`;
    }

    await sendTelegramMessage(env, chatId, message);
    return;
  }

  let heading;

  if (status === "done") {
    heading = "✅ کارهای انجام‌شده:";
  } else if (status === "all") {
    heading = "📋 همه کارها:";
  } else {
    heading = "📋 کارهای انجام‌نشده:";
  }

  if (dueDate) {
    heading += `\n📅 موعد: ${dueDate}`;
  }

  if (category) {
    heading += `\nدسته‌بندی: ${category}`;
  }

  await sendTelegramMessage(
    env,
    chatId,
    heading + "\n\n" + formatTaskList(tasks)
  );
}

// ثبت یک کار در دیتابیس
async function insertTask(env, userId, task) {
  const title = String(task.title || "").trim();
  const category = task.category;
  const dueAt = task.due_date || null;

  if (!title || title.length > 200) {
    throw new Error("عنوان کار معتبر نیست.");
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw new Error("دسته‌بندی کار معتبر نیست.");
  }

  if (dueAt && !isValidDate(dueAt)) {
    throw new Error("تاریخ کار معتبر نیست.");
  }

  const result = await env.abrnegar_db
    .prepare(`
      INSERT INTO tasks
      (telegram_user_id, title, category, due_at)
      VALUES (?, ?, ?, ?)
    `)
    .bind(userId, title, category, dueAt)
    .run();

  return result.meta.last_row_id;
}

// پیدا کردن کار با شماره نمایشی
async function getTaskByNumber(env, userId, number, status) {
  const tasks = await getTasks(env, userId, status);

  if (!Number.isInteger(number) || number < 1 || number > tasks.length) {
    return null;
  }

  return tasks[number - 1];
}

// پیدا کردن کار با عنوان یا عبارت
async function findTasksByTitle(env, userId, query, status) {
  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) return [];

  const tasks = await getTasks(env, userId, status);

  const normalizedQuery = normalizePersianText(cleanQuery);

  const exact = tasks.filter(task =>
    normalizePersianText(task.title) === normalizedQuery
  );

  if (exact.length) return exact;

  return tasks.filter(task =>
    normalizePersianText(task.title).includes(normalizedQuery) ||
    normalizedQuery.includes(normalizePersianText(task.title))
  );
}

// انجام عملیات روی یک کار
async function changeTaskStatus(env, userId, task, action) {
  if (action === "done") {
    return await env.abrnegar_db
      .prepare(`
        UPDATE tasks
        SET status = 'done', completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND telegram_user_id = ? AND status = 'pending'
      `)
      .bind(task.id, userId)
      .run();
  }

  if (action === "undone") {
    return await env.abrnegar_db
      .prepare(`
        UPDATE tasks
        SET status = 'pending', completed_at = NULL
        WHERE id = ? AND telegram_user_id = ? AND status = 'done'
      `)
      .bind(task.id, userId)
      .run();
  }

  if (action === "delete") {
    return await env.abrnegar_db
      .prepare(`
        DELETE FROM tasks
        WHERE id = ? AND telegram_user_id = ?
      `)
      .bind(task.id, userId)
      .run();
  }

  throw new Error("Unknown task action");
}

// پردازش عملیات با شماره یا عنوان کار
async function processTaskAction(
  env,
  chatId,
  userId,
  action,
  targetId = "",
  targetQuery = ""
) {
  const sourceStatus = action === "undone" ? "done" : action === "delete" ? "all" : "pending";

  let task = null;
  const numericTarget = Number(targetId);

  if (
    targetId &&
    Number.isInteger(numericTarget) &&
    numericTarget > 0
  ) {
    task = await getTaskByNumber(
      env,
      userId,
      numericTarget,
      sourceStatus
    );
  } else if (targetQuery) {
    const matches = await findTasksByTitle(
      env,
      userId,
      targetQuery,
      sourceStatus
    );

    if (matches.length === 1) {
      task = matches[0];
    } else if (matches.length > 1) {
      const lines = matches.map((item, index) =>
        `${index + 1}. ${item.title}`
      );

      await sendTelegramMessage(
        env,
        chatId,
        "چند کار مشابه پیدا کردم و نمی‌خواهم اشتباهی وضعیتشان را تغییر بدهم. عنوان دقیق‌تر را بفرست یا از دستور دستی /done شماره استفاده کن:\n\n" +
        lines.join("\n")
      );
      return;
    }
  }

  if (!task) {
    await sendTelegramMessage(
      env,
      chatId,
      "کار موردنظر رو پیدا نکردم. عنوان دقیق‌تر یا شماره کار رو بفرست.\n\n" +
      "برای دیدن شماره‌ها، /list رو ارسال کن."
    );
    return;
  }

  const result = await changeTaskStatus(
    env,
    userId,
    task,
    action
  );

  const messages = {
    done: `✅ کار «${task.title}» انجام‌شده ثبت شد.`,
    undone: `↩️ کار «${task.title}» به فهرست انجام‌نشده‌ها برگشت.`,
    delete: `🗑 کار «${task.title}» حذف شد.`
  };

  await sendTelegramMessage(
    env,
    chatId,
    result.meta.changes > 0
      ? messages[action]
      : "تغییری انجام نشد. ممکن است وضعیت این کار قبلاً تغییر کرده باشد."
  );
}

// ویرایش کار در دیتابیس
async function updateTask(
  env,
  userId,
  task,
  changes
) {
  const fields = [];
  const values = [];

  if (changes.title) {
    fields.push("title = ?");
    values.push(changes.title);
  }

  if (changes.category) {
    fields.push("category = ?");
    values.push(changes.category);
  }

  if (changes.clearDueDate) {
    fields.push("due_at = NULL");
  } else if (changes.dueDate) {
    fields.push("due_at = ?");
    values.push(changes.dueDate);
  }

  if (!fields.length) {
    return null;
  }

  values.push(task.id, userId);

  return await env.abrnegar_db
    .prepare(`
      UPDATE tasks
      SET ${fields.join(", ")}
      WHERE id = ? AND telegram_user_id = ?
    `)
    .bind(...values)
    .run();
}

// پردازش درخواست ویرایش کار
async function processEditAction(
  data,
  env,
  chatId,
  userId,
  originalText
) {
  const targetId = String(data.target_id || "").trim();
  const targetQuery = String(data.target_query || "").trim();

  const newTitle = String(data.edit_title || "").trim();
  const newCategory = String(data.edit_category || "").trim();
  const newDueDate = String(data.edit_due_date || "").trim();
  const clearDueDate = data.clear_due_date === true;

  if (
    !newTitle &&
    !newCategory &&
    !newDueDate &&
    !clearDueDate
  ) {
    await sendTelegramMessage(
      env,
      chatId,
      "مشخص نکردی چه چیزی را تغییر بدهم. عنوان، دسته‌بندی یا موعد جدید را بگو."
    );
    return;
  }

  if (newTitle) {
    if (newTitle.length > 200) {
      await sendTelegramMessage(
        env,
        chatId,
        "عنوان جدید نباید بیشتر از ۲۰۰ نویسه باشد."
      );
      return;
    }

    if (!isTitleFromOriginalMessage(newTitle, originalText)) {
      await sendTelegramMessage(
        env,
        chatId,
        "عنوان جدید را دقیقاً از متن پیامت تشخیص ندادم. برای جلوگیری از تغییر اشتباه، ویرایش انجام نشد.\n\nعنوان جدید را واضح‌تر بنویس."
      );
      return;
    }
  }

  if (
    newCategory &&
    !ALLOWED_CATEGORIES.includes(newCategory)
  ) {
    await sendTelegramMessage(
      env,
      chatId,
      "دسته‌بندی معتبر نیست. فقط از دانشگاه، خوابگاه، خرید یا شخصی استفاده کن."
    );
    return;
  }

  if (newDueDate && !isValidDate(newDueDate)) {
    await sendTelegramMessage(
      env,
      chatId,
      "تاریخ جدید معتبر نیست. لطفاً موعد را واضح‌تر بنویس."
    );
    return;
  }

  if (newDueDate && clearDueDate) {
    await sendTelegramMessage(
      env,
      chatId,
      "هم‌زمان نمی‌توان موعد جدید تعیین کرد و موعد قبلی را پاک کرد. یکی از این دو را مشخص کن."
    );
    return;
  }

  let task = null;
  const numericTarget = Number(targetId);

  if (
    targetId &&
    Number.isInteger(numericTarget) &&
    numericTarget > 0
  ) {
    task = await getTaskByNumber(
      env,
      userId,
      numericTarget,
      "all"
    );
  } else if (targetQuery) {
    const matches = await findTasksByTitle(
      env,
      userId,
      targetQuery,
      "all"
    );

    if (matches.length === 1) {
      task = matches[0];
    } else if (matches.length > 1) {
      const lines = matches.map((item, index) =>
        `${index + 1}. ${item.title}` +
        ` | ${item.category}` +
        (item.due_at ? ` | ${item.due_at}` : "")
      );

      await sendTelegramMessage(
        env,
        chatId,
        "چند کار مشابه پیدا کردم. برای اینکه اشتباهی ویرایش نکنم، شماره کار موردنظرت رو مشخص کن:\n\n" +
        lines.join("\n") +
        "\n\nشماره را در پیام بعدی بفرست."
      );
      return;
    }
  }

  if (!task) {
    await sendTelegramMessage(
      env,
      chatId,
      "کار موردنظر برای ویرایش پیدا نشد. عنوان دقیق‌تر یا شماره کار را بفرست."
    );
    return;
  }

  const result = await updateTask(
    env,
    userId,
    task,
    {
      title: newTitle,
      category: newCategory,
      dueDate: newDueDate,
      clearDueDate
    }
  );

  if (!result || result.meta.changes === 0) {
    await sendTelegramMessage(
      env,
      chatId,
      "هیچ تغییری در کار انجام نشد."
    );
    return;
  }

  const finalTitle = newTitle || task.title;
  const finalCategory = newCategory || task.category;

  let finalDueDate = task.due_at;

  if (clearDueDate) {
    finalDueDate = null;
  } else if (newDueDate) {
    finalDueDate = newDueDate;
  }

  await sendTelegramMessage(
    env,
    chatId,
    `✏️ کار با موفقیت ویرایش شد.

عنوان: ${finalTitle}
دسته‌بندی: ${finalCategory}
موعد: ${finalDueDate || "بدون موعد"}`
  );
}

// پردازش دستورهای دستی
async function handleManualCommand(
  command,
  input,
  env,
  chatId,
  userId
) {
  if (command === "/start" || command === "/help") {
    await sendTelegramMessage(env, chatId, getHelpText());
    return true;
  }

  if (command === "/add") {
    if (!input) {
      await sendTelegramMessage(
        env,
        chatId,
        "عنوان کار را هم بنویس.\nمثال:\n/add تحویل پروژه"
      );
      return true;
    }

    const parts = input.split("|").map(x => x.trim());
    const title = parts[0];
    const category = parts[1] || "شخصی";
    const dueAt = parts[2] || "";

    if (!title || title.length > 200) {
      await sendTelegramMessage(
        env,
        chatId,
        "عنوان کار باید بین ۱ تا ۲۰۰ نویسه باشد."
      );
      return true;
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      await sendTelegramMessage(
        env,
        chatId,
        "دسته‌بندی معتبر نیست. از دانشگاه، خوابگاه، خرید یا شخصی استفاده کن."
      );
      return true;
    }

    if (dueAt && !isValidDate(dueAt)) {
      await sendTelegramMessage(
        env,
        chatId,
        "تاریخ را به شکل میلادی YYYY-MM-DD وارد کن."
      );
      return true;
    }

    const id = await insertTask(env, userId, {
      title,
      category,
      due_date: dueAt
    });

    await sendTelegramMessage(
      env,
      chatId,
      `✅ کار با موفقیت ثبت شد.

عنوان: ${title}
دسته‌بندی: ${category}
${dueAt ? `موعد: ${dueAt}\n` : ""}شناسه داخلی: ${id}`
    );

    return true;
  }

  if (command === "/list") {
    await showTasks(env, chatId, userId, "pending");
    return true;
  }

  if (command === "/search") {
    if (!input) {
      await sendTelegramMessage(
        env,
        chatId,
        "عبارت مورد جستجو را بنویس."
      );
      return true;
    }

    const tasks = await env.abrnegar_db
      .prepare(`
        SELECT id, title, category, status, due_at
        FROM tasks
        WHERE telegram_user_id = ? AND title LIKE ?
        ORDER BY
          CASE WHEN due_at IS NULL OR due_at = '' THEN 1 ELSE 0 END ASC,
          due_at ASC,
          id ASC
        LIMIT 30
      `)
      .bind(userId, `%${input}%`)
      .all();

    if (!tasks.results.length) {
      await sendTelegramMessage(env, chatId, "موردی پیدا نشد.");
      return true;
    }

    await sendTelegramMessage(
      env,
      chatId,
      "🔎 نتایج جستجو:\n\n" + formatTaskList(tasks.results)
    );

    return true;
  }

  if (
    command === "/done" ||
    command === "/undone" ||
    command === "/del"
  ) {
    const actionMap = {
      "/done": "done",
      "/undone": "undone",
      "/del": "delete"
    };

    await processTaskAction(
      env,
      chatId,
      userId,
      actionMap[command],
      input
    );

    return true;
  }

  return false;
}

// استخراج منظور کاربر با هوش مصنوعی
async function understandMessage(env, text) {
  const today = getTehranToday();

  const systemPrompt = `
تو موتور تشخیص درخواست برای یک دستیار مدیریت کار فارسی هستی.
وظیفه تو تبدیل پیام کاربر به JSON مطابق ساختار داده‌شده است.

تاریخ امروز در منطقه زمانی Asia/Tehran:
${today}

قوانین مهم:

1. اگر کاربر درخواست ثبت کار دارد، intent برابر add_tasks باشد.
2. عنوان کار را دقیقاً از عبارت خود کاربر کپی کن.
3. عنوان کار را بازنویسی، خلاصه یا اصلاح نکن.
4. اسم درس‌ها و اصطلاحات تخصصی را دقیقاً حفظ کن.
5. هیچ کلمه‌ای را به عنوان اضافه نکن که در پیام کاربر وجود نداشته باشد.
6. اگر چند کار در پیام وجود دارد، عنوان هر کار را جداگانه استخراج کن.
7. اگر عنوان ثبت مشخص نیست، intent را clarify قرار بده.
8. دسته‌بندی یکی از دانشگاه، خوابگاه، خرید یا شخصی باشد.
9. اگر موعدی ذکر نشده، due_date رشته خالی باشد.
10. امروز، فردا و پس‌فردا را به تاریخ میلادی YYYY-MM-DD تبدیل کن.
11. اگر کاربر فهرست کارها را خواست، intent برابر list باشد.
12. برای کارهای انجام‌شده status_filter برابر done باشد.
13. برای کارهای انجام‌نشده status_filter برابر pending باشد.
14. برای همه کارها status_filter برابر all باشد.
15. اگر کاربر درباره یک دسته خاص پرسید، category_filter را مشخص کن.
16. اگر جستجو خواست، intent برابر search و عبارت را در query بگذار.
17. اگر گفت کاری انجام شده، intent برابر done باشد.
18. اگر گفت کاری را به حالت انجام‌نشده برگردان، intent برابر undone باشد.
19. اگر درخواست حذف کار داشت، intent برابر delete باشد.
20. برای عملیات روی کار، عنوان یا عبارت مشخص‌کننده کار را در target_query قرار بده.
21. target_query باید فقط عنوان کار باشد، نه جمله کامل کاربر.
22. اگر کاربر گفت کار شماره ۲، target_id برابر 2 باشد.
23. اگر عنوان کار مشخص نیست، intent برابر clarify باشد.
24. برای سلام و احوال‌پرسی، intent برابر chat باشد و پاسخ طبیعی بده؛ مثلاً به «سلام» بگو «سلام! چطور می‌تونم کمکت کنم؟».
25. اگر کاربر فقط شماره یا چند شماره مثل «۱ و ۲» فرستاد، آن را هرگز کار جدید تلقی نکن؛ intent برابر clarify باشد.
26. اگر کاربر گفت «همه کارها را انجام دادم» یا «دیگر کار انجام‌نشده ندارم»، intent برابر done باشد.
27. اگر کاربر گفت همه کارها یا همه کارهای انجام‌نشده را حذف کن، intent برابر delete باشد.
28. فیلدهای غیرمرتبط را با رشته خالی یا آرایه خالی پر کن.
29. هیچ شناسه‌ای را حدس نزن.

قوانین ویرایش:

27. اگر کاربر خواست اطلاعات یک کار موجود را تغییر دهد، intent برابر edit باشد.
28. کار هدف را در target_query مشخص کن، مگر اینکه شماره کار را گفته باشد که در آن صورت target_id را پر کن.
29. عنوان جدید را فقط در edit_title قرار بده.
30. عنوان جدید باید دقیقاً از متن پیام کاربر استخراج شود و نباید بازنویسی شود.
31. اگر کاربر فقط موعد را تغییر داد، edit_due_date را پر کن و edit_title و edit_category را خالی بگذار.
32. اگر کاربر فقط دسته‌بندی را تغییر داد، edit_category را پر کن.
33. اگر کاربر عنوان جدید خواست، edit_title را پر کن.
34. اگر کاربر خواست موعد قبلی حذف شود یا کار بدون موعد شود، clear_due_date برابر true باشد.
35. اگر کاربر موعد جدید تعیین کرد، edit_due_date را با تاریخ میلادی YYYY-MM-DD پر کن و clear_due_date برابر false باشد.
36. اگر کاربر درباره بخشی از کار چیزی نگفت، آن فیلد را خالی بگذار و آن بخش نباید تغییر کند.
37. اگر مشخص نیست کدام کار یا چه تغییری مدنظر است، intent را clarify قرار بده و سؤال بپرس.
38. برای ویرایش هم مانند سایر عملیات، target_query فقط عنوان کار قبلی باشد، نه جمله کامل کاربر.

مثال‌های ویرایش:

پیام: «عنوان تمرین شبکه رو به حل تمرین شبکه تغییر بده»
intent: edit
target_query: «تمرین شبکه»
edit_title: «حل تمرین شبکه»

پیام: «موعد امتحان امنیت رو بذار فردا»
intent: edit
target_query: «امتحان امنیت»
edit_due_date: تاریخ فردا
clear_due_date: false

پیام: «دسته‌بندی خرید کتاب رو به دانشگاه تغییر بده»
intent: edit
target_query: «خرید کتاب»
edit_category: «دانشگاه»

پیام: «موعد پروژه رو پاک کن»
intent: edit
target_query: «پروژه»
clear_due_date: true

مثال مهم ثبت:
پیام کاربر: «تمرین هوش محاسباتی دارم»
عنوان خروجی باید دقیقاً «تمرین هوش محاسباتی» باشد.
عنوان‌هایی مثل «تمرین هوش حسابی» یا «تمرین هوش مصنوعی» اشتباه هستند.

مقادیر status_filter فقط pending یا done یا all هستند.
فقط JSON مطابق ساختار داده‌شده برگردان.
`;

  const result = await env.AI.run(AI_MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ],
    response_format: {
      type: "json_schema",
      json_schema: AI_SCHEMA
    },
    temperature: 0,
    max_tokens: 700
  });

  let data = result?.response;

  if (typeof data === "string") {
    data = JSON.parse(data);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("AI returned an invalid response.");
  }

  const allowedIntents = [
    "add_tasks",
    "list",
    "search",
    "done",
    "undone",
    "delete",
    "edit",
    "chat",
    "clarify"
  ];

  if (!allowedIntents.includes(data.intent)) {
    throw new Error("AI returned an unknown intent.");
  }

  return data;
}

// اجرای درخواست تشخیص‌داده‌شده
async function executeAIIntent(
  data,
  env,
  chatId,
  userId,
  originalText
) {
  if (data.intent === "clarify") {
    await sendTelegramMessage(
      env,
      chatId,
      data.clarification_question ||
      "برای انجام درست درخواستت، کمی بیشتر توضیح بده."
    );
    return;
  }

  if (data.intent === "chat") {
    await sendTelegramMessage(
      env,
      chatId,
      data.reply || "من برای مدیریت کارها و برنامه‌ریزی در خدمتم. 🌱"
    );
    return;
  }

  if (data.intent === "add_tasks") {
    if (!Array.isArray(data.tasks) || data.tasks.length === 0) {
      await sendTelegramMessage(
        env,
        chatId,
        "متوجه شدم قصد ثبت کار داری، اما عنوان کار مشخص نیست."
      );
      return;
    }

    if (data.tasks.length > 5) {
      await sendTelegramMessage(
        env,
        chatId,
        "در هر پیام حداکثر ۵ کار ثبت می‌کنم."
      );
      return;
    }

    // اعتبارسنجی همه کارها پیش از ثبت
    for (const task of data.tasks) {
      const title = String(task.title || "").trim();
      const category = task.category;
      const dueAt = task.due_date || "";

      if (
        !title ||
        title.length > 200 ||
        !ALLOWED_CATEGORIES.includes(category) ||
        (dueAt && !isValidDate(dueAt))
      ) {
        await sendTelegramMessage(
          env,
          chatId,
          "اطلاعات یکی از کارها معتبر نبود و ثبت انجام نشد."
        );
        return;
      }

      // جلوگیری از تغییر خودسرانه عنوان توسط مدل
      if (!isTitleFromOriginalMessage(title, originalText)) {
        await sendTelegramMessage(
          env,
          chatId,
          "برای جلوگیری از ثبت عنوان اشتباه، این کار را ثبت نکردم. 😕\n\n" +
          "لطفاً عنوان کار را دقیق‌تر و به همان شکلی که می‌خواهی ثبت شود بنویس.\n\n" +
          "مثلاً: تمرین هوش محاسباتی"
        );
        return;
      }
    }

    const inserted = [];

    for (const task of data.tasks) {
      const id = await insertTask(env, userId, task);
      inserted.push({ ...task, id });
    }

    const lines = inserted.map(task =>
      `✅ ${task.title}\nدسته: ${task.category}` +
      (task.due_date ? `\nموعد: ${task.due_date}` : "")
    );

    await sendTelegramMessage(
      env,
      chatId,
      "کارها با موفقیت ثبت شدند 🌱\n\n" + lines.join("\n\n")
    );

    return;
  }

  if (data.intent === "list") {
    const category = ALLOWED_CATEGORIES.includes(data.category_filter)
      ? data.category_filter
      : "";

    let status = ["pending", "done", "all"].includes(data.status_filter)
      ? data.status_filter
      : "pending";

    const filterDate = isValidDate(data.filter_date)
      ? data.filter_date
      : extractFilterDate(originalText);

    if (
      /انجام\s*شده|تکمیل\s*شده|تموم\s*شده/.test(originalText)
    ) {
      status = "done";
    } else if (/همه\s*کارها|تمام\s*کارها/.test(originalText)) {
      status = "all";
    }

    await showTasks(
      env,
      chatId,
      userId,
      status,
      category,
      filterDate
    );

    return;
  }

  if (data.intent === "search") {
    const query = String(data.query || "").trim();

    if (!query) {
      await sendTelegramMessage(
        env,
        chatId,
        "عبارت مورد جستجو مشخص نیست."
      );
      return;
    }

    const result = await env.abrnegar_db
      .prepare(`
        SELECT id, title, category, status, due_at
        FROM tasks
        WHERE telegram_user_id = ? AND title LIKE ?
        ORDER BY
          CASE WHEN due_at IS NULL OR due_at = '' THEN 1 ELSE 0 END ASC,
          due_at ASC,
          id ASC
        LIMIT 30
      `)
      .bind(userId, `%${query}%`)
      .all();

    if (!result.results.length) {
      await sendTelegramMessage(env, chatId, "موردی پیدا نشد.");
      return;
    }

    await sendTelegramMessage(
      env,
      chatId,
      "🔎 نتایج جستجو:\n\n" + formatTaskList(result.results)
    );

    return;
  }

  if (data.intent === "edit") {
    await processEditAction(
      data,
      env,
      chatId,
      userId,
      originalText
    );
    return;
  }

  if (
    data.intent === "done" ||
    data.intent === "undone" ||
    data.intent === "delete"
  ) {
    const targetId = String(data.target_id || "").trim();
    const targetQuery = String(data.target_query || "").trim();

    let finalQuery = targetQuery;

    if (!targetId && !finalQuery) {
      const cleaned = originalText
        .replace(/انجام\s*شد|انجام\s*دادم|تموم\s*شد|تمام\s*شد|حذف\s*کن|پاک\s*کن|برگردون|برگردان/g, "")
        .replace(/کار|وظیفه|رو|را|من|لطفا|لطفاً/g, "")
        .trim();

      finalQuery = cleaned;
    }

    await processTaskAction(
      env,
      chatId,
      userId,
      data.intent,
      targetId,
      finalQuery
    );
  }
}

// تشخیص پیام‌های ساده و عملیات گروهی بدون وابستگی به خروجی مدل زبانی
function isGreetingMessage(text) {
  const value = normalizePersianText(text);
  return /^(سلام|درود|hi|hello|سلام علیکم|صبح بخیر|عصر بخیر|شب بخیر)[!.؟\s]*$/i.test(value);
}

function isNumericOnlyMessage(text) {
  return /^[\s\d۰-۹٠-٩،,و]+$/.test(String(text || ""));
}

function getRequestedListStatus(text) {
  const value = normalizePersianText(text);

  if (/کارهای?\s*(انجام شده|تکمیل شده)|کارهای?\s*تموم شده/.test(value)) return "done";
  if (/همه کارها|تمام کارها|کل کارها/.test(value)) return "all";

  return "pending";
}

function isListRequest(text) {
  const value = normalizePersianText(text);

  return (
    /(لیست|فهرست).*(کار|وظیفه)|(کار|وظیفه).*(لیست|فهرست|رو نشون بده|را نشان بده|نمایش بده|رو بفرست|را بفرست)/.test(value) ||
    /^(لیست|فهرست)( رو| را)?( بفرست| نشون بده| نمایش بده)?$/.test(value) ||
    /کارهای انجام نشده|کارهای انجام‌نشده|همه کارها|تمام کارها/.test(value)
  );
}

function isBulkDoneRequest(text) {
  const value = normalizePersianText(text);

  return (
    /(همه|تمام|کل)\s*کار(?:ها|های)?.{0,60}(انجام دادم|انجام شدند|انجام شد|تموم کردم|تمام کردم|تکمیل کردم)/.test(value) ||
    /(دیگه|دیگر)\s*کار(ی)?\s*انجام نشده ندارم|کار(ی)?\s*انجام نشده ندارم/.test(value) ||
    /همه کارها رو انجام دادم|همه کارها را انجام دادم/.test(value)
  );
}

function isBulkDeleteRequest(text) {
  const value = normalizePersianText(text);

  return (
    /(همه|تمام|کل)\s*کار(?:ها|های)?\s*(انجام نشده|انجام‌نشده).*(حذف|پاک)\s*کن/.test(value) ||
    /(همه|تمام|کل)\s*کار(?:ها|های)?.*(حذف|پاک)\s*کن/.test(value)
  );
}

function getActionFromText(text) {
  const value = normalizePersianText(text);

  if (/(انجام شد|انجام شدند|انجام دادم|انجام دادیم|تموم شد|تمام شد|تموم کردم|تمام کردم|تکمیل شد|تکمیل کردم|تمومش کردم)/.test(value)) return "done";
  if (/(انجام نشده کن|انجام‌نشده کن|برگردون|برگردان|ناتمام کن)/.test(value)) return "undone";
  if (/(حذف کن|پاک کن|حذفش کن|پاکش کن)/.test(value)) return "delete";

  return "";
}

function getActionSearchText(text) {
  return normalizePersianText(text)
    .replace(/انجام\s*شدند?|انجام\s*دادم|انجام\s*دادیم|تموم\s*شد|تمام\s*شد|تموم\s*کردم|تمام\s*کردم|تکمیل\s*شد|تکمیل\s*کردم|تمومش\s*کردم/g, " ")
    .replace(/انجام\s*نشده\s*کن|انجام‌نشده\s*کن|برگردون|برگردان|ناتمام\s*کن/g, " ")
    .replace(/حذف\s*کن|پاک\s*کن|حذفش\s*کن|پاکش\s*کن/g, " ")
    .replace(/همه|تمام|کل|کارها|کارهای|کار|وظیفه|وظایف|رو|را|من|لطفا|لطفاً|دیگه|دیگر/g, " ")
    .replace(/[،,؛;.!؟?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function taskMatchScore(task, messageText) {
  const title = normalizePersianText(task.title);
  const message = getActionSearchText(messageText);

  if (!title || !message) return 0;
  if (message.includes(title)) return 100;

  const stopWords = new Set([
    "گرفتم", "گرفت", "گرفتیم", "بگیرم", "بگیر", "بگیریم",
    "خریدم", "خرید", "بخرم", "بخر", "انجام", "دادم",
    "کنم", "کن", "کردم", "شود", "بشود", "برم", "بروم",
    "تحویل", "بدهم", "بدم", "دارم", "داشتم"
  ]);

  const titleWords = title.split(" ").filter(word => word.length > 1);
  const messageWords = new Set(message.split(" ").filter(word => word.length > 1));
  const coreWords = titleWords.filter(word => !stopWords.has(word));

  if (!coreWords.length) return 0;

  const matched = coreWords.filter(word => messageWords.has(word)).length;

  if (matched === 0) return 0;

  let score = (matched / coreWords.length) * 10;

  if (/(گرفتم|خریدم|پرداختم|تحویل دادم|فرستادم|انجام دادم)/.test(title)) score += 2;
  if (/(بگیرم|بخرم|پرداخت کنم|تحویل بدم|انجام بدم|باید)/.test(title)) score -= 2;

  return score;
}

// عملیات گروهی
async function processBulkTaskAction(env, chatId, userId, action, pendingOnly = true) {
  if (action === "done") {
    const result = await env.abrnegar_db
      .prepare(`
        UPDATE tasks
        SET status = 'done', completed_at = CURRENT_TIMESTAMP
        WHERE telegram_user_id = ? AND status = 'pending'
      `)
      .bind(userId)
      .run();

    const count = Number(result.meta?.changes || 0);

    await sendTelegramMessage(
      env,
      chatId,
      count ? `✅ ${count} کار به‌عنوان انجام‌شده ثبت شد. 🌱` : "🎉 هیچ کار انجام‌نشده‌ای در فهرستت وجود ندارد."
    );

    return;
  }

  if (action === "delete") {
    const result = pendingOnly
      ? await env.abrnegar_db.prepare(`
          DELETE FROM tasks
          WHERE telegram_user_id = ? AND status = 'pending'
        `).bind(userId).run()
      : await env.abrnegar_db.prepare(`
          DELETE FROM tasks
          WHERE telegram_user_id = ?
        `).bind(userId).run();

    const count = Number(result.meta?.changes || 0);

    await sendTelegramMessage(
      env,
      chatId,
      count ? `🗑 ${count} کار ${pendingOnly ? "انجام‌نشده" : ""} حذف شد.` : "کاری برای حذف پیدا نکردم."
    );
  }
}

// تشخیص و اجرای عملیات طبیعی روی یک یا چند کار
async function processNaturalLanguageTaskAction(env, chatId, userId, text, action) {
  const sourceStatus = action === "undone" ? "done" : action === "delete" ? "all" : "pending";
  const tasks = await getTasks(env, userId, sourceStatus);

  if (!tasks.length) {
    await sendTelegramMessage(
      env,
      chatId,
      action === "done" ? "کاری در فهرست انجام‌نشده‌ها پیدا نکردم." : "کاری برای این عملیات پیدا نکردم."
    );
    return;
  }

  const normalizedMessage = normalizePersianText(text);

  let matches = tasks.filter(task =>
    normalizedMessage.includes(normalizePersianText(task.title))
  );

  if (!matches.length) {
    const scored = tasks
      .map(task => ({ task, score: taskMatchScore(task, text) }))
      .filter(item => item.score >= 7)
      .sort((a, b) => b.score - a.score);

    if (scored.length) {
      const bestScore = scored[0].score;
      matches = scored.filter(item => item.score === bestScore).map(item => item.task);
    }
  }

  if (!matches.length) {
    await sendTelegramMessage(
      env,
      chatId,
      "عنوان کار موردنظر را با چند کلمه مشخص‌تر بنویس. برای دیدن شماره‌ها هم /list را بفرست."
    );
    return;
  }

  if (matches.length > 1) {
    const exactMatches = matches.filter(task =>
      normalizedMessage.includes(normalizePersianText(task.title))
    );

    if (exactMatches.length > 1) {
      matches = exactMatches;
    } else {
      const choices = matches.map(task => `• ${task.title}`).join("\n");

      await sendTelegramMessage(
        env,
        chatId,
        "چند کار مشابه پیدا کردم و برای جلوگیری از تغییر اشتباه، فعلاً هیچ‌کدام را تغییر ندادم.\n\n" +
        choices +
        "\n\nعنوان دقیق‌تر را بفرست یا از دستور دستی مثل /done 3 استفاده کن."
      );

      return;
    }
  }

  let changedCount = 0;

  for (const task of matches) {
    const result = await changeTaskStatus(env, userId, task, action);
    changedCount += Number(result.meta?.changes || 0);
  }

  if (!changedCount) {
    await sendTelegramMessage(env, chatId, "تغییری انجام نشد؛ ممکن است وضعیت کارها قبلاً تغییر کرده باشد.");
    return;
  }

  const actionLabel = {
    done: "انجام‌شده",
    undone: "به فهرست انجام‌نشده‌ها برگشت",
    delete: "حذف شد"
  }[action];

  await sendTelegramMessage(
    env,
    chatId,
    matches.length === 1
      ? `✅ کار «${matches[0].title}» ${actionLabel} ثبت شد.`
      : `✅ ${changedCount} کار با موفقیت ${action === "done" ? "انجام‌شده" : action === "delete" ? "حذف" : "به فهرست انجام‌نشده‌ها برگردانده"} شدند.`
  );
}

// پردازش پیام‌های ساده و عملیات قطعی
async function handleDeterministicMessage(env, chatId, userId, text) {
  if (isGreetingMessage(text)) {
    await sendTelegramMessage(env, chatId, "سلام! 🌱 چطور می‌تونم کمکت کنم؟");
    return true;
  }

  if (isNumericOnlyMessage(text)) {
    await sendTelegramMessage(
      env,
      chatId,
      "فقط شماره فرستادی. برای تغییر وضعیت یا حذف کار از دستورهایی مثل /done 2 یا /del 2 استفاده کن."
    );
    return true;
  }

  if (isBulkDeleteRequest(text)) {
    const pendingOnly = /(انجام نشده|انجام‌نشده)/.test(normalizePersianText(text));
    await processBulkTaskAction(env, chatId, userId, "delete", pendingOnly);
    return true;
  }

  if (isBulkDoneRequest(text)) {
    await processBulkTaskAction(env, chatId, userId, "done", true);
    return true;
  }

  if (isListRequest(text)) {
    await showTasks(env, chatId, userId, getRequestedListStatus(text));
    return true;
  }

  const action = getActionFromText(text);

  if (action) {
    await processNaturalLanguageTaskAction(env, chatId, userId, text, action);
    return true;
  }

  return false;
}

// پردازش پیام دریافتی تلگرام
async function handleMessage(message, env) {
  if (!message.text || !message.from || !message.chat) return;

  const userId = String(message.from.id);
  const chatId = message.chat.id;
  const text = message.text.trim();

  if (!text || text.length > 1000) {
    await sendTelegramMessage(
      env,
      chatId,
      "پیامت خیلی طولانی است. لطفاً کوتاه‌تر بنویس."
    );
    return;
  }

  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const input = args.join(" ").trim();

  if (command.startsWith("/")) {
    const handled = await handleManualCommand(
      command,
      input,
      env,
      chatId,
      userId
    );

    if (handled) return;

    await sendTelegramMessage(
      env,
      chatId,
      "این دستور را نمی‌شناسم. برای راهنما /help را بفرست."
    );

    return;
  }

  try {
    const handledDeterministically = await handleDeterministicMessage(
      env,
      chatId,
      userId,
      text
    );

    if (handledDeterministically) return;

    const data = await understandMessage(env, text);

    await executeAIIntent(
      data,
      env,
      chatId,
      userId,
      text
    );
  } catch (error) {
    console.error("AI processing error:", error);

    await sendTelegramMessage(
      env,
      chatId,
      "در پردازش پیام مشکلی پیش آمد. 😕\n\n" +
      "می‌تونی فعلاً از دستورهای دستی مثل /add و /list استفاده کنی."
    );
  }
}

// یادآوری روزانه کارهای انجام‌نشده
async function sendDailyReminders(env) {
  const users = await env.abrnegar_db
    .prepare(`
      SELECT DISTINCT telegram_user_id
      FROM tasks
      WHERE status = 'pending'
    `)
    .all();

  console.log(
    `Daily reminder started. Users: ${users.results.length}`
  );

  for (const user of users.results) {
    const userId = String(user.telegram_user_id);

    try {
      const tasks = await getTasks(env, userId, "pending");

      if (!tasks.length) continue;

      const message =
        "☀️ صبح بخیر! وقت برنامه‌ریزی روزانه است.\n\n" +
        "📋 این کارها هنوز انجام نشده‌اند:\n\n" +
        formatTaskList(tasks.slice(0, 30)) +
        "\n\n🌱 قدم‌به‌قدم پیش برو. برای دیدن فهرست کامل /list را بفرست.";

      await sendTelegramMessage(env, userId, message);

      console.log(`Reminder sent to user ${userId}`);
    } catch (error) {
      console.error(
        `Reminder failed for user ${userId}:`,
        error
      );
    }
  }

  console.log("Daily reminder finished.");
}

// نقطه ورود اصلی Worker
export default {
  async scheduled(controller, env, ctx) {
    console.log("Cron triggered:", controller.cron);
    ctx.waitUntil(sendDailyReminders(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        success: true,
        project: "Abrnegar",
        message: "Worker is running"
      });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not Found", { status: 404 });
    }

    const webhookSecret = request.headers.get(
      "X-Telegram-Bot-Api-Secret-Token"
    );

    if (
      !env.WEBHOOK_SECRET ||
      webhookSecret !== env.WEBHOOK_SECRET
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const update = await request.json();

      if (update.message) {
        await handleMessage(update.message, env);
      }

      return new Response("OK");
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};