-- SSH terminals render glyphs using the client's font. Use text by default,
-- including plugin-owned icons that mini.icons alone does not replace.
local diagnostics = { Error = "E ", Warn = "W ", Hint = "H ", Info = "I " }

return {
  {
    "LazyVim/LazyVim",
    opts = function(_, opts)
      local icons = vim.deepcopy(require("lazyvim.config").icons)
      icons.misc = { dots = "..." }
      icons.ft = { octo = "git", gh = "git", ["markdown.gh"] = "git" }
      icons.diagnostics = diagnostics
      icons.git = { added = "+", modified = "~", removed = "-" }
      icons.dap = { Stopped = ">", Breakpoint = "B", BreakpointCondition = "?", BreakpointRejected = "!", LogPoint = ".>" }
      for kind in pairs(icons.kinds) do icons.kinds[kind] = kind:sub(1, 2) .. " " end
      opts.icons = icons
    end,
  },
  { "nvim-mini/mini.icons", opts = { style = "ascii" } },
  {
    "akinsho/bufferline.nvim",
    opts = { options = {
      show_buffer_icons = false, show_close_icon = false,
      buffer_close_icon = "x", modified_icon = "*", close_icon = "x",
      left_trunc_marker = "<", right_trunc_marker = ">",
      separator_style = { "", "" }, indicator = { icon = "|", style = "icon" },
    } },
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      opts.options.icons_enabled = false
      opts.options.component_separators = "|"
      opts.options.section_separators = ""
      opts.sections = {
        lualine_a = { "mode" }, lualine_b = { "branch" },
        lualine_c = {
          { "filename", path = 1, symbols = { modified = " [+]", readonly = " [RO]", unnamed = "[New]" } },
          { "diagnostics", symbols = { error = "E:", warn = "W:", info = "I:", hint = "H:" } },
        },
        lualine_x = { { "diff", symbols = { added = "+", modified = "~", removed = "-" } }, "filetype" },
        lualine_y = { "progress", "location" }, lualine_z = { function() return os.date("%R") end },
      }
    end,
  },
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = {
      default_component_configs = {
        indent = { indent_marker = "|", last_indent_marker = "`", expander_collapsed = ">", expander_expanded = "v" },
        icon = { folder_closed = "+", folder_open = "-", folder_empty = "+", folder_empty_open = "-", selected = ">", default = "f" },
        diagnostics = { symbols = { error = "E", warn = "W", info = "I", hint = "H" } },
        git_status = { symbols = { added = "+", deleted = "-", modified = "~", renamed = "R", untracked = "?", ignored = "i", unstaged = "U", staged = "S", conflict = "!" } },
      },
      source_selector = { sources = {
        { source = "filesystem", display_name = "Files" },
        { source = "buffers", display_name = "Buffers" },
        { source = "git_status", display_name = "Git" },
      } },
    },
  },
  {
    "lewis6991/gitsigns.nvim",
    opts = function(_, opts)
      local signs = { add = { text = "+" }, change = { text = "~" }, delete = { text = "-" }, topdelete = { text = "-" }, changedelete = { text = "~" }, untracked = { text = "?" } }
      opts.signs = signs
      opts.signs_staged = vim.deepcopy(signs)
    end,
  },
  {
    "folke/which-key.nvim",
    opts = function(_, opts)
      opts.icons = { mappings = false, rules = false, breadcrumb = ">", separator = ":", group = "+", ellipsis = "...", keys = {} }
      for _, key in ipairs({ "Up", "Down", "Left", "Right", "CR", "Esc", "ScrollWheelDown", "ScrollWheelUp", "NL", "BS", "Space", "Tab", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12" }) do opts.icons.keys[key] = key .. " " end
      opts.icons.keys.C = "Ctrl+"
      opts.icons.keys.M = "Alt+"
      opts.icons.keys.D = "Super+"
      opts.icons.keys.S = "Shift+"
    end,
  },
  {
    "folke/noice.nvim",
    opts = {
      cmdline = { format = {
        cmdline = { icon = ":" }, search_down = { icon = "/" }, search_up = { icon = "?" },
        filter = { icon = "$" }, lua = { icon = "lua" }, help = { icon = "help" },
        calculator = { icon = "=" }, input = { icon = ">" },
      } },
      popupmenu = { kind_icons = false },
      lsp = { progress = { enabled = false } },
      format = { level = { icons = { error = "E", warn = "W", info = "I", debug = "D", trace = "T" } } },
    },
  },
  {
    "folke/snacks.nvim",
    opts = function(_, opts)
      opts.dashboard = vim.tbl_deep_extend("force", opts.dashboard or {}, {
        preset = { header = "Personal Harness\n\nCode  |  Research  |  Writing  |  Personal projects" },
        sections = { { section = "header" }, { section = "keys", gap = 1, padding = 1 } },
      })
      for _, item in ipairs(opts.dashboard.preset.keys or {}) do item.icon = "" end
      opts.notifier = vim.tbl_deep_extend("force", opts.notifier or {}, {
        icons = { error = "E", warn = "W", info = "I", debug = "D", trace = "T" },
      })
      opts.picker = vim.tbl_deep_extend("force", opts.picker or {}, {
        prompt = "> ",
        icons = {
          files = { enabled = false, dir = "+ ", dir_open = "- ", file = "f " },
          keymaps = { nowait = "! " }, undo = { saved = "S " },
          tree = { vertical = "| ", middle = "|-", last = "`-" },
          ui = { live = "* ", selected = "+ ", unselected = "  " },
          git = { commit = "C ", staged = "S", added = "+", deleted = "-", ignored = "i", modified = "~", renamed = "R", unmerged = "!", untracked = "?" },
          diagnostics = diagnostics,
          lsp = { unavailable = "x", enabled = "+", disabled = "-", attached = "=" },
          kinds = LazyVim.config.icons.kinds,
        },
      })
    end,
  },
  { "mason-org/mason.nvim", opts = { ui = { icons = { package_installed = "+", package_pending = ">", package_uninstalled = "-" } } } },
  {
    "folke/trouble.nvim",
    opts = function(_, opts)
      opts.icons = { indent = { top = "| ", middle = "|-", last = "`-", fold_open = "v ", fold_closed = "> " }, folder_closed = "+ ", folder_open = "- ", kinds = LazyVim.config.icons.kinds }
    end,
  },
}
