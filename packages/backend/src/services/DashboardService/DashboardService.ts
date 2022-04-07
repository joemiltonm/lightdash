import {
    CreateDashboard,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    SessionUser,
    UpdateDashboard,
} from 'common';
import { analytics } from '../../analytics/client';
import { CreateDashboardOrVersionEvent } from '../../analytics/LightdashAnalytics';
import database from '../../database/database';
import { getSpace } from '../../database/entities/spaces';
import { ForbiddenError } from '../../errors';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';

type Dependencies = {
    dashboardModel: DashboardModel;
};

export class DashboardService {
    dashboardModel: DashboardModel;

    constructor({ dashboardModel }: Dependencies) {
        this.dashboardModel = dashboardModel;
    }

    static getCreateEventProperties(
        dashboard: Dashboard,
    ): CreateDashboardOrVersionEvent['properties'] {
        return {
            dashboardId: dashboard.uuid,
            filtersCount: dashboard.filters
                ? dashboard.filters.metrics.length +
                  dashboard.filters.dimensions.length
                : 0,
            tilesCount: dashboard.tiles.length,
            chartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SAVED_CHART,
            ).length,
            markdownTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.MARKDOWN,
            ).length,
            loomTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.LOOM,
            ).length,
        };
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: string,
        chartUuid?: string,
    ): Promise<DashboardBasicDetails[]> {
        return this.dashboardModel.getAllByProject(projectUuid, chartUuid);
    }

    async getById(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        return this.dashboardModel.getById(dashboardUuid);
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        if (user.ability.cannot('create', 'Dashboard')) {
            throw new ForbiddenError();
        }
        const space = await getSpace(database, projectUuid);
        const newDashboard = await this.dashboardModel.create(
            space.space_uuid,
            dashboard,
        );
        analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            properties: DashboardService.getCreateEventProperties(newDashboard),
        });
        return this.getById(user, newDashboard.uuid);
    }

    async update(
        user: SessionUser,
        dashboardUuid: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        if (user.ability.cannot('update', 'Dashboard')) {
            throw new ForbiddenError();
        }
        if (isDashboardUnversionedFields(dashboard)) {
            await this.dashboardModel.update(dashboardUuid, {
                name: dashboard.name,
                description: dashboard.description,
            });
            analytics.track({
                event: 'dashboard.updated',
                userId: user.userUuid,
                organizationId: user.organizationUuid,
                properties: {
                    dashboardId: dashboardUuid,
                },
            });
        }
        if (isDashboardVersionedFields(dashboard)) {
            const updatedDashboard = await this.dashboardModel.addVersion(
                dashboardUuid,
                {
                    tiles: dashboard.tiles,
                    filters: dashboard.filters,
                },
            );
            analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                organizationId: user.organizationUuid,
                properties:
                    DashboardService.getCreateEventProperties(updatedDashboard),
            });
        }
        return this.getById(user, dashboardUuid);
    }

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        if (user.ability.cannot('delete', 'Dashboard')) {
            throw new ForbiddenError();
        }
        await this.dashboardModel.delete(dashboardUuid);
        analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                dashboardId: dashboardUuid,
            },
        });
    }
}
