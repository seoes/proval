<script lang="ts">
    import { page } from '$app/stores';
    import { HouseIcon, GitForkIcon, CubeIcon, PlugsIcon, GitBranchIcon } from 'phosphor-svelte';
    import type { Component } from 'svelte';

    interface SidebarItem {
        label: string;
        href: string;
        icon: Component;
    }
    interface SidebarItemGroup {
        label: string;
        items: SidebarItem[];
    }
    const sidebarItemList: SidebarItemGroup[] = [
        {
            label: 'CONFIG',
            items: [
                {
                    label: 'Dashboard',
                    href: '/dashboard',
                    icon: HouseIcon
                },
                {
                    label: 'Project',
                    href: '/repository',
                    icon: GitForkIcon
                },
                {
                    label: 'Model',
                    href: '/model',
                    icon: CubeIcon
                },
                {
                    label: 'Git Provider',
                    href: '/settings/provider',
                    icon: GitBranchIcon
                }
            ]
        },
        {
            label: 'PLACEHOLDER',
            items: [
                {
                    label: 'Test',
                    href: '/placeholder',
                    icon: CubeIcon
                }
            ]
        }
    ];
</script>

<div class="h-full min-h-screen w-full bg-slate-100 px-4 py-4">
    <div>
        <div class="px-4 text-3xl font-semibold tracking-tight text-neutral-800">
            <a href="/">Proval</a>
        </div>
    </div>
    <div class="mt-4 divide-y divide-neutral-300">
        {#each sidebarItemList as itemGroup}
            <div class="py-3">
                <!-- <h2 class="h-6 leading-6 tracking-tight cursor-default text-neutral-500 text-sm px-2">{itemGroup.label}</h2> -->
                <ul class="space-y-1">
                    {#each itemGroup.items as item}
                        <li>
                            <a class="" href={item.href}>
                                <span
                                    class="flex h-10 items-center gap-2 rounded-md px-3.5 text-sm leading-8 tracking-wide transition-colors hover:bg-primary hover:text-neutral-100 {$page
                                        .url.pathname === item.href
                                        ? 'bg-primary text-neutral-100'
                                        : 'text-neutral-500'}"
                                >
                                    <svelte:component this={item.icon} class="size-5" />
                                    {item.label}
                                </span>
                            </a>
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    </div>
</div>
