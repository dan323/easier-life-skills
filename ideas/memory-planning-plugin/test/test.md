
**Session A — baseline**: Start fresh (`/clear`). Send the message above. Claude explores freely.                                                                                                                         
Run `/cost` when it answers.                                                                                                                                                                                                
> "I want to scaffold the memplan plugin. What command do I run, what files will be                                                                                                                                       
> created, and what constraints apply to this work?"

Session

Total cost:            $0.1354                                                                                                                                                                                                   
Total duration (API):  26s                                                                                                                                                                                                       
Total duration (wall): 36s                                                                                                                                                                                                       
Total code changes:    0 lines added, 0 lines removed                                                                                                                                                                            
Usage by model:                                                                                                                                                                                                                  
claude-haiku-4-5:  484 input, 15 output, 0 cache read, 0 cache write ($0.0006)                                                                                                                                               
claude-sonnet-4-6:  348 input, 1.2k output, 115.6k cache read, 21.5k cache write ($0.1348)


**Session B — with memplan**: Start fresh (`/clear`). Send:                                                                                                                                                               
> "Read `.memtest/START.md` and follow its instructions, then answer: I want to scaffold the memplan plugin. What command do I run, what files will be created, and what constraints apply to this work?"                                                                                                                                                                                        

Total cost:            $0.1067                                                                                                                                                                                                   
Total duration (API):  21s                                                                                                                                                                                                       
Total duration (wall): 29s                                                                                                                                                                                                       
Total code changes:    0 lines added, 0 lines removed                                                                                                                                                                            
Usage by model:                                                                                                                                                                                                                  
claude-haiku-4-5:  564 input, 15 output, 0 cache read, 0 cache write ($0.0006)                                                                                                                                               
claude-sonnet-4-6:  347 input, 1.1k output, 80.7k cache read, 17.1k cache write ($0.1061)
                                                                                                                                                                                                                          
Run `/cost` when it answers.                                                                                                                                                                                              
                                                                                                                                                                                                                          
The question is identical. The only difference is the source of context.                                                                                                                                                  
                                                                                                                                                                                                                          
**Pass**: Session B uses ≤10% of Session A's tokens.                                                                                                                                                                      
**Fail / drop project**: Session B uses more than 25% of Session A's tokens.     
                                                                                                                                                                                                                                    
---                                                                                                                                                                                                                               
What to look for

┌───────────┬───────────────────────────────────────────────────────────────┐                                                                                                                                                     
│           │                           Expected                            │                                                                                                                                                     
├───────────┼───────────────────────────────────────────────────────────────┤                                                                                                                                                     
│ Session A │ 5,000–20,000 tokens (README + CLAUDE.md + plugin exploration) │                                                                                                                                                     
├───────────┼───────────────────────────────────────────────────────────────┤                                                                                                                                                     
│ Session B │ ≤500 tokens (7 .mem files, nothing else)                      │                                                                                                                                                     
└───────────┴───────────────────────────────────────────────────────────────┘ 