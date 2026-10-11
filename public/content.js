// Everything you'd normally edit lives here.
// Sections appear in the order written. A section holds either rows or paragraphs:
//   rows: [{ date, text }]   a small date on the left
//   rows: [{ name, text }]   a name on the left
//   paragraphs: ['…', '…']   plain prose

window.SITE = {
  name: 'Khushmeet Shergill',

  // The background: 'season' follows the time of year (winter, garden in spring,
  // sunlight in summer, autumn), or name one: life, stars, autumn, sunlight, winter, garden.
  background: 'season',

  intro: "I'm an infrastructure engineer in the Bay Area. I look for the step everyone still does by hand and make it go away, and I like my own software the old way: write it, compile it, run it.",

  // icon matches a symbol in index.html: bluesky, github, mail
  links: [
    { label: 'Bluesky', url: 'https://bsky.app/profile/khush.sh', icon: 'bluesky', me: true },
    { label: 'GitHub', url: 'https://github.com/khushmeeet', icon: 'github', me: true },
    { label: 'Email khushmeet@hey.com', url: 'mailto:khushmeet@hey.com', icon: 'mail', tooltip: 'khushmeet@hey.com' },
  ],

  sections: [
    {
      title: 'Now',
      rows: [
        {
          date: 'Oct 2026',
          text: 'Turning a pocket e-ink reader into a tiny computer, so I reach for my phone less. Teaching Hearth to run my family\'s apps. Settling the core of my language: indentation, no braces. Listening to Western and Indian classical music side by side.',
        },
      ],
    },
    {
      title: 'Building',
      rows: [
        { name: 'Hearth', text: 'Upload a binary, watch its logs, keep it running. A deployer for one home server, with no containers and only boring protocols.' },
        { name: 'A new language', text: 'One way to do things, compiled straight to machine code, with a single binary for the whole toolchain. When its goals collide, expressiveness wins.' },
        { name: 'X4 Pro firmware', text: 'My own firmware for the Xteink X4 Pro, built small and only for what I use.' },
        { name: 'leechess', text: 'A chess coach that explains how to think about a move, not just what the engine says, and brings back the tactics I keep missing.' },
        { name: 'Orbit', text: 'A podcast app that sorts episodes by how fast they go stale, so the ones that keep can wait.' },
        { name: 'LLM notebook', text: 'Prompts as notebook cells you can fold away, so a long conversation stops being one endless scroll.' },
      ],
    },
    {
      title: 'Rabbit holes',
      rows: [
        { name: 'Plan 9', text: 'What everyday computing might look like if Bell Labs\' sequel to Unix had won.' },
        { name: 'Variable fonts', text: 'Axes, ligatures, and the texture healing that makes some monospace fonts read so evenly.' },
        { name: 'Cellular automata', text: 'Lenia, neural cellular automata, and other simple rules that look alive. Hence the dots.' },
        { name: 'The Chronofile', text: 'Buckminster Fuller recorded his life every fifteen minutes for decades. I want a digital one.' },
        { name: 'Classical music', text: 'Western and Indian traditions, heard against each other.' },
        { name: 'Sky surveys', text: 'Maps of millions of galaxies, and the software astronomers use to read them.' },
      ],
    },
    {
      title: 'By day',
      paragraphs: [
        'I work on Apple\'s identity infrastructure as a contract engineer. I look after about 17 services handling around 5 million requests a minute, and most of my work is taking people out of the loop: pipelines that deploy and test every merge, a provisioner that builds whole QE environments in place of days of setup, and a console that two dozen SREs use to run bare-metal servers.',
        'Before that I spent three years at HSBC tuning authentication and moving services to AWS. I studied computer science at VIT and data science at the University at Buffalo.',
      ],
    },
  ],

  colophon: "Set in Instrument Serif and Instrument Sans. The background follows the seasons: snow in winter, a wildflower meadow in spring, leaf shadows in summer and falling leaves in autumn. All of it is drawn in code.",
};
