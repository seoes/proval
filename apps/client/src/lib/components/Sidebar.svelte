<script lang="ts">
    import { page } from "$app/stores";
    import ProvalMark from "$lib/components/atom/ProvalMark.svelte";
    import ThemeToggle from "$lib/components/atom/ThemeToggle.svelte";
    import {
        HouseIcon,
        GitForkIcon,
        CubeIcon,
        GitBranchIcon,
        ChatCircleTextIcon,
        GearIcon,
        UsersIcon,
    } from "phosphor-svelte";
    import type { Component } from "svelte";

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
            label: "SERVICE",
            items: [
                {
                    label: "Dashboard",
                    href: "/",
                    icon: HouseIcon,
                },

                {
                    label: "Repository",
                    href: "/repository",
                    icon: GitForkIcon,
                },
                {
                    label: "Review",
                    href: "/review",
                    icon: ChatCircleTextIcon,
                },
            ],
        },

        {
            label: "SETTINGS",
            items: [
                {
                    label: "Git Provider",
                    href: "/provider",
                    icon: GitBranchIcon,
                },
                {
                    label: "Model Provider",
                    href: "/model-provider",
                    icon: CubeIcon,
                },
                {
                    label: "User",
                    href: "/user",
                    icon: UsersIcon,
                },
                {
                    label: "Settings",
                    href: "/settings",
                    icon: GearIcon,
                },
            ],
        },
    ];

    function isActive(href: string, pathname: string): boolean {
        if (href === "/") {
            return pathname === "/" || pathname === "/dashboard";
        }
        return pathname === href || pathname.startsWith(`${href}/`);
    }
</script>

<div class="sticky top-0 flex h-dvh w-full flex-col overflow-y-auto bg-sidebar px-4 py-4 text-sidebar-foreground">
    <div class="px-3.5">
        <a href="/" class="inline-flex items-center" aria-label="Proval home">
            <ProvalMark wordmark class="size-8" wordmarkClass="text-2xl font-semibold tracking-tight text-foreground" />
        </a>
    </div>
    <div class="mt-4 divide-y divide-sidebar-border">
        {#each sidebarItemList as itemGroup}
            <div class="py-3">
                <!-- <h2 class="h-6 leading-6 tracking-tight cursor-default text-muted-foreground text-sm px-2">{itemGroup.label}</h2> -->
                <ul class="space-y-1">
                    {#each itemGroup.items as item}
                        {#if item.href === "/user" && $page.data.auth?.user?.role !== "admin"}
                            <!-- skip non-admin -->
                        {:else}
                            <li>
                                <a class="" href={item.href}>
                                    <span
                                        class="flex h-10 items-center gap-2 rounded-md px-3.5 text-sm tracking-wide transition-colors hover:bg-sidebar-primary hover:text-sidebar-primary-foreground {isActive(
                                            item.href,
                                            $page.url.pathname,
                                        )
                                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                            : 'text-muted-foreground'}">
                                        <svelte:component this={item.icon} class="size-5" />
                                        {item.label}
                                    </span>
                                </a>
                            </li>
                        {/if}
                    {/each}
                </ul>
            </div>
        {/each}
    </div>
    <div class="mt-auto flex cursor-default items-center">
        <ThemeToggle side="top" align="start" />
    </div>
</div>
