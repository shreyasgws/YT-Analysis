<!--
Video ID: RQ1IfKUD1nw
Title: Linus Torvalds Explains What Makes Linux So Fast
Language: en
Generated: 2026-08-04T11:55:29.348Z
Pipeline Version: 1.0.0
Prompt Version: 1.0.0
Model: qwen3.5:4b-v1
-->

# Linus Torvalds Explains What Makes Linux So Fast

Linus Torvalds attributes his exclusive preference for C in operating system development to its deep connection with hardware and its ability to force developers 'to think like a computer.' He appreciates that writing C provides precise predictability regarding the resulting assembly code, allowing him to understand exactly how instructions are generated. This mindset has enabled him to achieve exceptional performance through careful algorithmic design followed by granular micro-optimizations at the instruction level, specifically in areas like file and path lookup, which he believes is a rewarding pursuit when done with expertise.

## Key takeaways
- Linus Torvalds prefers C due to its close relationship with hardware architecture
- Writing C allows developers to visualize exactly how code translates into assembly instructions
- The simplicity of early compiler design meant C output was historically predictable and efficient
- Torvalds prioritizes strong algorithmic foundations before applying low-level optimizations

## [00:00] The Case for C in OS Development

* Linus Torvalds remains uniquely drawn to **C** as his primary language for operating system development.
* He attributes this preference partly to a love of hardware, stating that interacting with it from a software perspective is highly motivating. "I have yet to see a language that comes even close to C in that respect."*

"It's not just that you can use C to generate good code for hardware; it's if you think like a computer, writing C actually makes sense.
The people who designed C did so when compilers were simple and the language had to be geared towards what the output was."
* This historical context means developers using **C** know exactly how their code will translate into assembly: "When I read **C**, I know what the assembly language will look like."*

While he spends most of his time as a technical lead reviewing others' work, recent changes to file and path lookup algorithms demonstrate deep mastery. The goal is to minimize cache misses at the instruction level.
* Despite common advice against micro-optimization, Torvalds argues that if one loves it, "that's what you should do." He emphasizes ensuring strong algorithmic design before applying these granular optimizations.*

The result of this approach has been a highly efficient implementation where file names are looked up exceptionally fast. This performance achieved on parallel thousand-CPU machines remains impressive and highlights his commitment to pushing the limits of **C**.
"I'm very proud of the fact that we look up fast names way faster than anybody else."