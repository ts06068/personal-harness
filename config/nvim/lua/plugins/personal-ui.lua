-- Keep LazyVim's native icons. The terminal on the client computer must use
-- JetBrainsMono Nerd Font Mono (see README); ASCII substitutions hide icons.
return {
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
