<script lang="ts">
    import { page } from '$app/stores';

    interface SidebarItem {
        label: string;
        href: string;
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
                    href: '/dashboard'
                },
                {
                    label: 'Git Repository',
                    href: '/repository'
                },
                {
                    label: 'Model',
                    href: '/model'
                }
            ]
        },
        {
            label: 'PLACEHOLDER',
            items: [
                {
                    label: 'test',
                    href: '/placeholder'
                }
            ]
        }
    ];
</script>

<div class="h-full min-h-screen w-full bg-neutral-100 px-4 py-4">
    <div>
        <h1 class="px-2 text-2xl font-semibold tracking-tight">
            <a href="/">Code Review</a>
        </h1>
    </div>
    <div class="mt-4 divide-y divide-neutral-300">
        {#each sidebarItemList as itemGroup}
            <div class="py-3">
                <!-- <h2 class="h-6 leading-6 tracking-tight cursor-default text-neutral-500 text-sm px-2">{itemGroup.label}</h2> -->
                <ul class="space-y-px">
                    {#each itemGroup.items as item}
                        <li>
                            <a class="" href={item.href}>
                                <span
                                    class="block h-8 rounded-md px-2 align-middle text-sm leading-8 text-neutral-500 hover:bg-neutral-200 {$page
                                        .url.pathname === item.href
                                        ? 'bg-neutral-200 '
                                        : ''}"
                                >
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
