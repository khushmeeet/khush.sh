// Everything you'd normally edit lives here.
// Each list becomes rows on the page, in the order written.

window.SITE = {
  name: 'Khushmeet Shergill',
  intro: 'Infrastructure engineer in the Bay Area. I look for the step everyone still does by hand, and make it go away.',

  // icon matches a symbol in index.html: bluesky, github, mail
  links: [
    { label: 'Bluesky', url: 'https://bsky.app/profile/khush.sh', icon: 'bluesky', me: true },
    { label: 'GitHub', url: 'https://github.com/khushmeeet', icon: 'github', me: true },
    { label: 'Email khushmeet@hey.com', url: 'mailto:khushmeet@hey.com', icon: 'mail', tooltip: 'khushmeet@hey.com' },
  ],

  now: [
    {
      when: 'Sep 2026',
      text: "Writing firmware for the X4 Pro, getting Hearth to run my family's apps, pinning down the core ideas for my language, and listening across Western and Indian classical music.",
    },
  ],

  building: [
    { title: 'Hearth', text: "Deploys my family's apps to one home server. Go, no Docker." },
    { title: 'A new language', text: 'Designed from its goals outward, with a rule for which goal wins when they conflict.' },
    { title: 'X4 Pro firmware', text: 'Custom firmware for the Xteink X4 Pro e-ink reader.' },
    { title: 'leechess', text: 'A chess trainer built around a coaching loop.' },
    { title: 'Orbit', text: 'A podcast app that sorts episodes by how quickly they go stale.' },
    { title: 'LLM notebook', text: 'A Jupyter-style notebook where every cell is a prompt.' },
  ],

  work: [
    {
      when: '2023–now',
      title: 'Apple',
      role: 'Infrastructure engineer, Auth Services',
      text: 'I run about 17 services serving around 5 million requests a minute. I moved them onto Spinnaker pipelines that deploy, test and record results on every merge; built a provisioner that stands up full QE environments, replacing days to weeks of manual setup; wrote the Terraform and Python layer for a new internal cloud; and built an Electron console that two dozen SREs use to manage bare-metal servers.',
    },
    {
      when: '2018–2021',
      title: 'HSBC',
      role: 'Software engineer',
      text: 'Tuned the authentication system, moved services from on-prem to AWS, and delivered regulatory projects.',
    },
  ],

  education: [
    { when: '2021–2023', title: 'University at Buffalo', role: 'MS, Data Science' },
    { when: '2014–2018', title: 'VIT Vellore', role: 'B.Tech, Computer Science' },
  ],

  colophon: "Set in Instrument Serif and Instrument Sans. The background runs Conway's Game of Life at a steady density. It gathers around the text and thins out beneath it, and its colors change with the seasons.",
};
