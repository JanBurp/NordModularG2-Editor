/*
 * G2 CLI - Output formatting implementation
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cJSON.h"
#include "output.h"

static void tree_parse_value(const char *json, int *pos, int indent, int isLast);
static void print_compact(const char *json);

void output_json(const cJSON *json, int format) {
    char *json_str = NULL;
    
    if (format == OUTPUT_TREE) {
        json_str = cJSON_PrintUnformatted(json);
        if (!json_str) return;
        
        int pos = 0;
        tree_parse_value(json_str, &pos, 0, 1);
        free(json_str);
    } else if (format == OUTPUT_PRETTY) {
        json_str = cJSON_PrintUnformatted(json);
        if (!json_str) return;
        
        print_compact(json_str);
        free(json_str);
    } else {
        json_str = cJSON_PrintUnformatted(json);
        if (!json_str) return;
        printf("%s\n", json_str);
        free(json_str);
    }
}

static void print_compact(const char *json) {
    int depth = 0;
    int inString = 0;
    
    for (int i = 0; json[i]; i++) {
        char c = json[i];
        
        if (c == '"' && (i == 0 || json[i-1] != '\\')) {
            inString = !inString;
            putchar(c);
        } else if (inString) {
            putchar(c);
        } else if (c == '{' || c == '[') {
            putchar(c);
            putchar('\n');
            depth++;
            for (int j = 0; j < depth; j++) printf("  ");
        } else if (c == '}') {
            putchar('\n');
            depth--;
            for (int j = 0; j < depth; j++) printf("  ");
            putchar('}');
        } else if (c == ']') {
            putchar('\n');
            depth--;
            for (int j = 0; j < depth; j++) printf("  ");
            putchar(']');
        } else if (c == ',') {
            putchar(',');
            putchar('\n');
            for (int j = 0; j < depth; j++) printf("  ");
        } else if (c == ':') {
            printf(": ");
        } else if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            // Skip whitespace from unformatted JSON
        } else {
            putchar(c);
        }
    }
    putchar('\n');
}

static void tree_parse_value(const char *json, int *pos, int indent, int isLast) {
    (void)isLast;
    char c = json[*pos];
    
    if (c == '{') {
        printf("{\n");
        (*pos)++;
        int childIndent = indent + 1;
        int first = 1;
        while (json[*pos] && json[*pos] != '}') {
            while (json[*pos] == ' ') (*pos)++;
            if (json[*pos] == '}') break;
            
            if (!first) {
                printf("\n");
            }
            first = 0;
            
            if (json[*pos] == '\"') {
                (*pos)++;
                char key[64] = {0};
                int ki = 0;
                while (json[*pos] && json[*pos] != '\"') {
                    key[ki++] = json[(*pos)++];
                }
                (*pos)++;
                
                while (json[*pos] == ' ') (*pos)++;
                if (json[*pos] == ':') {
                    (*pos)++;
                    while (json[*pos] == ' ') (*pos)++;
                }
                
                int isObject = (json[*pos] == '{' || json[*pos] == '[');
                int lastInSet = 0;
                
                const char *p = json + (*pos);
                int braceCount = 0;
                int bracketCount = 0;
                while (*p) {
                    if (*p == '{' || *p == '[') break;
                    if (*p == '}') { if (braceCount == 0) { lastInSet = 1; break; } braceCount--; }
                    if (*p == ']') { if (bracketCount == 0) { lastInSet = 1; break; } bracketCount--; }
                    if (*p == ',') { if (braceCount == 0 && bracketCount == 0) break; }
                    p++;
                }
                
                for (int i = 0; i < childIndent; i++) {
                    printf("%s  ", i == childIndent - 1 ? (lastInSet ? "\\-" : "|-") : "|");
                }
                printf("\"%s\": ", key);
                
                if (isObject) {
                    printf("\n");
                    tree_parse_value(json, pos, childIndent, lastInSet);
                } else {
                    while (json[*pos] == ' ') (*pos)++;
                    if (json[*pos] == '\"') {
                        (*pos)++;
                        putchar('\"');
                        while (json[*pos] && json[*pos] != '\"') {
                            if (json[*pos] == '\\' && json[*pos+1] == '\"') {
                                putchar('\\');
                                putchar('\"');
                                (*pos) += 2;
                            } else {
                                putchar(json[*pos]);
                                (*pos)++;
                            }
                        }
                        putchar('\"');
                        (*pos)++;
                    } else {
                        while (json[*pos] && json[*pos] != ',' && json[*pos] != '}') {
                            putchar(json[*pos]);
                            (*pos)++;
                        }
                    }
                    printf("\n");
                }
            }
            while (json[*pos] && json[*pos] != ',') (*pos)++;
            if (json[*pos] == ',') (*pos)++;
        }
        for (int i = 0; i < indent; i++) {
            printf("   ");
        }
        printf("}\n");
        (*pos)++;
    } else if (c == '[') {
        (*pos)++;
        int first = 1;
        while (json[*pos] && json[*pos] != ']') {
            while (json[*pos] == ' ') (*pos)++;
            if (json[*pos] == ']') break;
            
            if (!first) printf("\n");
            first = 0;
            
            if (json[*pos] == '{') {
                tree_parse_value(json, pos, indent + 1, 0);
            } else {
                for (int i = 0; i < indent + 1; i++) {
                    printf("%s  ", i == indent ? "\\-" : "|");
                }
                while (json[*pos] && json[*pos] != ',') {
                    putchar(json[*pos]);
                    (*pos)++;
                }
                printf("\n");
            }
            while (json[*pos] == ' ') (*pos)++;
            if (json[*pos] == ',') (*pos)++;
        }
        (*pos)++;
    } else {
        while (json[*pos] && json[*pos] != ',' && json[*pos] != '}') {
            putchar(json[*pos]);
            (*pos)++;
        }
        printf("\n");
    }
}