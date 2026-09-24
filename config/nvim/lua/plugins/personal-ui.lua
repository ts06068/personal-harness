-- Keep LazyVim's native icons. The terminal on the client computer must use
-- JetBrainsMono Nerd Font Mono (see README); ASCII substitutions hide icons.
return {
  {
    "folke/tokyonight.nvim",
    opts = {
      transparent = true,
      styles = { sidebars = "transparent", floats = "transparent" },
      on_highlights = function(hl)
        -- Keep syntax foregrounds, remove painted UI/diff/selection backgrounds.
        for name, group in pairs(hl) do
          if type(group) == "table" then
            if group.bg then group.bg = "NONE" end
            if name:match("^NeoTree") or name:match("^SnacksDashboard")
              or name:match("^SnacksPicker") or name:match("^WinSeparator")
              or name:match("^FloatBorder") or name:match("^StatusLine")
              or name:match("^TabLine") then
              group.fg = "#b0b0b0"
            end
          end
        end
        hl.Normal = { fg = "#e5e5e5", bg = "NONE" }
        hl.NormalNC = { fg = "#e5e5e5", bg = "NONE" }
        hl.NormalFloat = { bg = "NONE" }
        hl.Visual = { bg = "NONE", underline = true }
        hl.CursorLine = { bg = "NONE" }
        hl.NeoTreeCursorLine = { bg = "NONE", bold = true, underline = true }
        hl.SnacksPickerListCursorLine = { bg = "NONE", bold = true, underline = true }
      end,
    },
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      local theme = {}
      for _, mode in ipairs({ "normal", "insert", "visual", "replace", "command", "inactive" }) do
        theme[mode] = {
          a = { fg = "#e5e5e5", bg = "NONE", gui = "bold" },
          b = { fg = "#b0b0b0", bg = "NONE" },
          c = { fg = "#909090", bg = "NONE" },
        }
      end
      opts.options = vim.tbl_deep_extend("force", opts.options or {}, {
        theme = theme, component_separators = "", section_separators = "",
      })
    end,
  },
  {
    "akinsho/bufferline.nvim",
    opts = { highlights = {
      fill = { bg = "NONE" }, background = { fg = "#909090", bg = "NONE" },
      buffer_selected = { fg = "#e5e5e5", bg = "NONE", bold = true, italic = false },
      buffer_visible = { fg = "#b0b0b0", bg = "NONE" },
      separator = { fg = "#666666", bg = "NONE" },
      separator_selected = { fg = "#909090", bg = "NONE" },
      separator_visible = { fg = "#666666", bg = "NONE" },
    } },
  },
  { "nvim-mini/mini.icons", opts = { style = "glyph" } },
  {
    "folke/snacks.nvim",
    opts = {
      dashboard = {
        preset = { header = "Personal Harness\n\nCode  |  Research  |  Writing  |  Personal projects" },
        sections = { { section = "header" }, { section = "keys", gap = 1, padding = 1 } },
      },
    },
  },
}
